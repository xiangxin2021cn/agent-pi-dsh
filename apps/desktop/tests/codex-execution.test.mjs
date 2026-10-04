import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createCodexExecutionController, validateExecutionIdentity } from '../codex-execution.mjs'

const tick = () => new Promise((done) => setImmediate(done))
const identity = { sessionId: 'session-test', cwd: 'C:\\project' }
function harness(options = {}) {
  const calls = [], bridges = [], children = [], events = [], watches = new Map(), questions = []
  let contextGate
  const contextWait = new Promise((done) => { contextGate = done })
  const controller = createCodexExecutionController({
    nodePath: 'node', wrapperPath: 'codex.js', codexHome: tmpdir(), stateFile: options.stateFile,
    baseEnv: { OPENAI_API_KEY: 'secret-inherited', CODEX_ACCESS_TOKEN: 'secret-inherited', PATH: 'safe' },
    onEvent: (event) => events.push(event),
    spawn(_node, args, spawnOptions) {
      assert.deepEqual(args, ['codex.js', 'app-server', '--stdio'])
      assert.equal(spawnOptions.windowsHide, true)
      assert.equal(spawnOptions.env.OPENAI_API_KEY, undefined)
      assert.equal(spawnOptions.env.CODEX_ACCESS_TOKEN, undefined)
      const child = new EventEmitter()
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null
      child.kill = () => { child.exitCode = 0; child.emit('close', 0) }
      child.reply = (message) => child.stdout.write(JSON.stringify(message) + '\n')
      child.stdin = new Writable({ write(chunk, _encoding, done) {
        const message = JSON.parse(String(chunk))
        calls.push(message)
        if (!message.method || !Object.hasOwn(message, 'id')) { done(); return }
        if (options.holdTurnStart && message.method === 'turn/start') { done(); return }
        if (options.rpcError?.(message)) child.reply({ id: message.id, error: options.rpcError(message) })
        else {
          const result = message.method.startsWith('thread/') ? { thread: { id: 'native-thread' } }
            : message.method === 'turn/start' ? { turn: { id: 'turn-' + calls.length } } : {}
          child.reply({ id: message.id, result })
        }
        done()
      } })
      children.push(child)
      return child
    },
    async bridge(action, input) {
      bridges.push({ action, input })
      if (action === 'context') {
        if (options.holdContext) await contextWait
        return { ...identity, lease: 'lease-' + bridges.length, sandbox: options.sandbox || 'read-only', developerInstructions: 'professional-evidence-policy', dynamicTools: [{ type: 'function', name: 'cordis', inputSchema: { type: 'object' }, description: 'professional tools' }] }
      }
      if (action === 'watch') return new Promise((resolveWatch) => watches.set(input.lease, resolveWatch))
      if (action === 'release' || action === 'cancel') { watches.get(input.lease)?.({ active: false }); return { released: true } }
      if (action === 'tool') return { isError: false, value: { cost: 25 }, content: [{ type: 'text', text: '25' }] }
      if (action === 'question') {
        await options.question?.(input)
        questions.push(structuredClone(input))
        return { linked: true, revision: questions.length }
      }
      return { recorded: true }
    },
  })
  return { controller, calls, bridges, children, events, contextGate, questions }
}

test('native main execution persists one thread across turns, resumes, and steers without DSH delegation', async () => {
  const h = harness()
  try {
    await h.controller.submit({ ...identity, text: 'Review the tender', model: 'selected-model', reasoningEffort: 'high' })
    assert.equal(h.controller.status(identity.sessionId).phase, 'running')
    const start = h.calls.find((row) => row.method === 'thread/start')
    assert.equal(start.params.sandbox, 'read-only')
    assert.equal(start.params.dynamicTools[0].name, 'cordis')
    assert.equal(start.params.developerInstructions, 'professional-evidence-policy')
    assert.deepEqual(h.calls.find((row) => row.method === 'turn/start').params.sandboxPolicy, { type: 'readOnly', networkAccess: false })
    await h.controller.submit({ ...identity, text: 'Use the revised BOQ' })
    assert.ok(h.calls.some((row) => row.method === 'turn/steer' && row.params.expectedTurnId))
    assert.ok(h.bridges.some((row) => row.action === 'record' && row.input.text === 'Use the revised BOQ'))
    const child = h.children[0]
    for (const method of ['item/started', 'item/completed']) child.reply({ method, params: { threadId: 'native-thread', item: { type: 'userMessage', id: 'server-user-1', content: [{ type: 'text', text: 'Review the tender' }] } } })
    assert.equal(h.controller.status(identity.sessionId).messages.filter((row) => row.role === 'user').length, 2)
    child.reply({ method: 'item/agentMessage/delta', params: { threadId: 'native-thread', itemId: 'answer', delta: 'Verified ' } })
    child.reply({ method: 'item/agentMessage/delta', params: { threadId: 'native-thread', itemId: 'answer', delta: 'basis.' } })
    child.reply({ method: 'turn/completed', params: { threadId: 'native-thread', turn: { status: 'completed' } } })
    await tick()
    assert.equal(h.controller.status(identity.sessionId).messages.find((row) => row.id === 'answer').text, 'Verified basis.')
    await h.controller.submit({ ...identity, text: 'Continue planning' })
    assert.equal(h.calls.filter((row) => row.method === 'thread/start').length, 1)
    assert.equal(h.calls.filter((row) => row.method === 'thread/resume').length, 1)
    assert.equal(h.children.length, 1)
    assert.ok(!JSON.stringify(h.calls).includes('subagent_codex'))
  } finally { h.controller.dispose() }
})

test('dynamic tool arguments cannot replace the current session, cwd, lease or call identity', async () => {
  const h = harness()
  try {
    await h.controller.submit({ ...identity, text: 'Calculate cost' })
    const lease = h.bridges.find((row) => row.action === 'watch').input.lease
    h.children[0].reply({ id: 'tool-call', method: 'item/tool/call', params: { threadId: 'native-thread', callId: 'official-call', tool: 'cordis', arguments: { action: 'call', tool: 'professional_task', args: { action: 'status' }, sessionId: 'foreign', cwd: 'C:\\foreign', lease: 'forged', callId: 'forged' } } })
    await tick()
    const actual = h.bridges.find((row) => row.action === 'tool').input
    assert.equal(actual.sessionId, identity.sessionId); assert.equal(actual.cwd, identity.cwd)
    assert.equal(actual.lease, lease); assert.equal(actual.callId, 'official-call')
    assert.ok(h.calls.some((row) => row.id === 'tool-call' && row.result?.contentItems[0].type === 'inputText'))
    h.children[0].reply({ method: 'item/completed', params: { threadId: 'native-thread', item: { id: 'official-call', type: 'dynamicToolCall', tool: 'cordis', arguments: { tool: 'professional_task' }, status: 'completed', contentItems: [{ type: 'inputText', text: '{"cost":25}' }] } } })
    h.children[0].reply({ method: 'item/completed', params: { threadId: 'native-thread', item: { id: 'native-command', type: 'commandExecution', command: 'calculate', status: 'completed', aggregatedOutput: 'Verified cost = 25' } } })
    assert.equal(h.controller.status(identity.sessionId).messages.filter((row) => row.id === 'cordis-official-call').length, 1)
    assert.match(h.controller.status(identity.sessionId).messages.find((row) => row.id === 'native-command').text, /Verified cost = 25/)
  } finally { h.controller.dispose() }
})

test('questions and approvals require a reply from the matching task; unsupported permissions fail closed', async () => {
  const h = harness()
  try {
    await h.controller.submit({ ...identity, text: 'Prepare the report' })
    h.children[0].reply({ id: 500, method: 'item/tool/requestUserInput', params: { threadId: 'native-thread', questions: [{ id: 'jurisdiction', question: 'Which country?' }] } })
    await tick()
    assert.equal(h.controller.status(identity.sessionId).phase, 'waiting')
    await assert.rejects(h.controller.reply({ ...identity, cwd: 'C:\\foreign' }, 500, { jurisdiction: 'Namibia' }), /不匹配/)
    await h.controller.reply(identity, 500, { jurisdiction: 'Namibia' })
    assert.deepEqual(h.calls.find((row) => row.id === 500 && row.result).result, { answers: { jurisdiction: { answers: ['Namibia'] } } })
    h.children[0].reply({ id: 501, method: 'item/fileChange/requestApproval', params: { threadId: 'native-thread', reason: 'Write report' } })
    await tick(); await h.controller.reply(identity, 501, 'decline')
    assert.deepEqual(h.calls.find((row) => row.id === 501 && row.result).result, { decision: 'decline' })
    h.children[0].reply({ id: 502, method: 'unknown/approval', params: { threadId: 'native-thread' } })
    await tick(); assert.equal(h.calls.find((row) => row.id === 502).error.code, -32601)
  } finally { h.controller.dispose() }
})

test('native questions and answers commit to shared task before presenting or replying', async () => {
  let releaseQuestion, releaseAnswer
  const questionGate = new Promise(resolve => { releaseQuestion = resolve })
  const answerGate = new Promise(resolve => { releaseAnswer = resolve })
  const h = harness({ question: input => input.answers ? answerGate : questionGate })
  try {
    await h.controller.submit({ ...identity, text: 'Check project conditions' })
    h.children[0].reply({ id: 610, method: 'item/tool/requestUserInput', params: { threadId: 'native-thread', itemId: 'country-call', questions: [{ id: 'country', question: 'Which country?' }] } })
    await tick()
    assert.equal(h.controller.status(identity.sessionId).phase, 'running')
    assert.equal(h.controller.status(identity.sessionId).requests.length, 0)
    assert.equal(h.questions.length, 0)
    releaseQuestion(); await tick()
    assert.equal(h.controller.status(identity.sessionId).phase, 'waiting')
    assert.equal(h.questions[0].callId, 'country-call'); assert.equal(h.questions[0].requestId, '610')
    const replying = h.controller.reply(identity, 610, { country: 'Namibia' })
    await tick()
    assert.ok(!h.calls.some(row => row.id === 610 && row.result))
    assert.equal(h.questions.length, 1)
    releaseAnswer(); await replying
    assert.equal(h.questions[1].answers.country, 'Namibia')
    assert.deepEqual(h.calls.find(row => row.id === 610 && row.result).result, { answers: { country: { answers: ['Namibia'] } } })
    assert.equal(h.controller.status(identity.sessionId).requests.length, 0)
  } finally { releaseQuestion?.(); releaseAnswer?.(); h.controller.dispose() }
})

test('native secret answers reach the protocol while shared records and events contain only a redaction', async () => {
  const h = harness()
  try {
    await h.controller.submit({ ...identity, text: 'Read a protected source' })
    h.children[0].reply({ id: 611, method: 'item/tool/requestUserInput', params: { threadId: 'native-thread', itemId: 'secret-call', questions: [{ id: 'password', question: 'Source password?', isSecret: true }] } })
    await tick()
    await h.controller.reply(identity, 611, { password: 'project-password-must-stay-private' })
    assert.equal(h.calls.find(row => row.id === 611 && row.result).result.answers.password.answers[0], 'project-password-must-stay-private')
    assert.equal(h.questions[1].answers.password, '已通过原生问答提供敏感信息')
    for (const value of [h.bridges, h.events, h.controller.status(identity.sessionId)]) assert.ok(!JSON.stringify(value).includes('project-password-must-stay-private'))
  } finally { h.controller.dispose() }
})

test('failure to record a native question fails closed without publishing a fabricated question or answer', async () => {
  const h = harness({ question: () => { throw new Error('upstream credential=never-display') } })
  try {
    await h.controller.submit({ ...identity, text: 'Review source' })
    h.children[0].reply({ id: 612, method: 'item/tool/requestUserInput', params: { threadId: 'native-thread', questions: [{ id: 'source', question: 'Which source?' }] } })
    await tick()
    const response = h.calls.find(row => row.id === 612 && row.error)
    assert.equal(response.error.code, -32603)
    assert.ok(!JSON.stringify(response).includes('never-display'))
    assert.equal(h.questions.length, 0); assert.equal(h.controller.status(identity.sessionId).requests.length, 0)
    await assert.rejects(h.controller.reply(identity, 612, { source: 'New version' }), /失效/)
    assert.ok(!h.calls.some(row => row.id === 612 && row.result))
  } finally { h.controller.dispose() }
})

test('failed shared answer remains retryable and cannot send a fabricated protocol answer', async () => {
  let failing = true
  const h = harness({ question: input => { if (input.answers && failing) throw new Error('upstream token=never-display') } })
  try {
    await h.controller.submit({ ...identity, text: 'Review source' })
    h.children[0].reply({ id: 613, method: 'item/tool/requestUserInput', params: { threadId: 'native-thread', questions: [{ id: 'scope', question: 'Which scope?' }] } })
    await tick()
    await assert.rejects(h.controller.reply(identity, 613, { scope: 'Current phase' }), error => {
      assert.ok(!error.message.includes('never-display'), 'upstream credential-bearing errors must be sanitized')
      return true
    })
    assert.equal(h.questions.length, 1)
    assert.equal(h.controller.status(identity.sessionId).phase, 'waiting')
    assert.ok(!h.calls.some(row => row.id === 613 && row.result))
    failing = false
    await h.controller.reply(identity, 613, { scope: 'Current phase' })
    assert.equal(h.questions[1].answers.scope, 'Current phase')
    assert.equal(h.calls.filter(row => row.id === 613 && row.result).length, 1)
  } finally { h.controller.dispose() }
})

test('concurrent replies cannot double-record an answer and cancel prevents a delayed protocol reply', async () => {
  let releaseAnswer
  const answerGate = new Promise(resolve => { releaseAnswer = resolve })
  const h = harness({ question: input => input.answers ? answerGate : undefined })
  try {
    await h.controller.submit({ ...identity, text: 'Review source' })
    h.children[0].reply({ id: 614, method: 'item/tool/requestUserInput', params: { threadId: 'native-thread', questions: [{ id: 'scope', question: 'Which scope?' }] } })
    await tick()
    const first = h.controller.reply(identity, 614, { scope: 'Current phase' })
    await assert.rejects(h.controller.reply(identity, 614, { scope: 'All phases' }), /失效/)
    assert.equal(h.bridges.filter(row => row.action === 'question' && row.input.answers).length, 1)
    await h.controller.interrupt(identity)
    releaseAnswer()
    await assert.rejects(first, /取消|失效/)
    assert.ok(!h.calls.some(row => row.id === 614 && row.result))
    await assert.rejects(h.controller.reply(identity, 614, { scope: 'All phases' }), /失效/)
  } finally { releaseAnswer?.(); h.controller.dispose() }
})

test('a delayed shared question response cannot resurrect a stopped or completed native turn', async t => {
  for (const ending of ['interrupt', 'completed']) await t.test(ending, async () => {
    let releaseQuestion
    const questionGate = new Promise(resolve => { releaseQuestion = resolve })
    const h = harness({ question: () => questionGate })
    try {
      await h.controller.submit({ ...identity, text: 'Review project' })
      h.children[0].reply({ id: 615, method: 'item/tool/requestUserInput', params: { threadId: 'native-thread', questions: [{ id: 'scope', question: 'Which scope?' }] } })
      await tick()
      if (ending === 'interrupt') await h.controller.interrupt(identity)
      else {
        h.children[0].reply({ method: 'turn/completed', params: { threadId: 'native-thread', turn: { status: 'completed' } } })
        await tick()
      }
      releaseQuestion(); await tick()
      assert.equal(h.controller.status(identity.sessionId).requests.length, 0)
      assert.notEqual(h.controller.status(identity.sessionId).phase, 'waiting')
      assert.ok(h.calls.some(row => row.id === 615 && row.error), 'the interrupted native request must fail closed')
    } finally { releaseQuestion?.(); h.controller.dispose() }
  })
})

test('stop during pending context prevents a later native turn from starting', async () => {
  const h = harness({ holdContext: true })
  try {
    const submission = h.controller.submit({ ...identity, text: 'Create files' })
    await tick()
    await h.controller.interrupt(identity)
    h.contextGate()
    await assert.rejects(submission, /已停止/)
    assert.equal(h.calls.filter((row) => row.method === 'turn/start').length, 0)
    assert.equal(h.controller.status(identity.sessionId).phase, 'idle')
    assert.ok(h.bridges.some((row) => row.action === 'release'))
  } finally { h.controller.dispose() }
})

test('stop during a pending turn acknowledgement interrupts the newly acknowledged native turn', async () => {
  const h = harness({ holdTurnStart: true })
  try {
    const submission = h.controller.submit({ ...identity, text: 'Create the plan' })
    await tick()
    const start = h.calls.find((row) => row.method === 'turn/start')
    assert.ok(start)
    await h.controller.interrupt(identity)
    h.children[0].reply({ id: start.id, result: { turn: { id: 'started-after-stop' } } })
    await assert.rejects(submission, /停止/)
    assert.ok(h.calls.some((row) => row.method === 'turn/interrupt' && row.params.turnId === 'started-after-stop'))
    assert.equal(h.controller.status(identity.sessionId).phase, 'idle')
  } finally { h.controller.dispose() }
})

test('native thread identity is durable and resumed after app restart with original conversation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-native-test-'))
  const stateFile = join(dir, 'state.json')
  const first = harness({ stateFile })
  try {
    await first.controller.submit({ ...identity, text: 'Task one' })
    first.children[0].reply({ method: 'turn/completed', params: { threadId: 'native-thread', turn: { status: 'completed' } } })
    await tick(); first.controller.dispose()
    const resumed = harness({ stateFile })
    try {
      assert.equal(resumed.controller.status(identity.sessionId).messages[0].text, 'Task one')
      await resumed.controller.submit({ ...identity, text: 'Continue same task' })
      assert.ok(resumed.calls.some((row) => row.method === 'thread/resume' && row.params.threadId === 'native-thread'))
      assert.ok(!resumed.calls.some((row) => row.method === 'thread/start'))
    } finally { resumed.controller.dispose() }
  } finally { first.controller.dispose(); rmSync(dir, { recursive: true, force: true }) }
})

test('a no-rollout thread can be recreated only when it has no accepted task history', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-native-empty-'))
  try {
    for (const messages of [[], [{ id: 'prior', role: 'user', text: 'Must not lose this task' }]]) {
      const stateFile = join(dir, 'state.json')
      writeFileSync(stateFile, JSON.stringify({ sessions: [{ ...identity, threadId: 'native-thread', messages }] }))
      const h = harness({ stateFile, rpcError: (message) => message.method === 'thread/resume' ? { code: -32600, message: 'no rollout found for thread id native-thread' } : null })
      try {
        if (messages.length) { await assert.rejects(h.controller.submit({ ...identity, text: 'Continue' })); assert.ok(!h.calls.some((row) => row.method === 'thread/start')) }
        else { await h.controller.submit({ ...identity, text: 'Start again' }); assert.ok(h.calls.some((row) => row.method === 'thread/start')) }
      } finally { h.controller.dispose() }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('attachments retain original paths and clipboard image bytes', async () => {
  const h = harness()
  try {
    await h.controller.submit({ ...identity, text: 'Read these originals', attachments: [{ path: 'C:\\project\\drawing.dwg', kind: 'file' }, { path: 'C:\\project\\scan.png', kind: 'image' }, { kind: 'image', dataUrl: 'data:image/png;base64,AA==' }] })
    const input = h.calls.find((row) => row.method === 'turn/start').params.input
    assert.ok(input[0].text.includes('drawing.dwg'))
    assert.deepEqual(input[1], { type: 'localImage', path: 'C:\\project\\scan.png' })
    assert.deepEqual(input[2], { type: 'image', url: 'data:image/png;base64,AA==' })
    const imageMetadata = h.bridges.find((row) => row.action === 'context').input.attachments[2]
    assert.equal(imageMetadata.nativeImage, true)
    assert.equal(imageMetadata.dataUrl, undefined)
    await assert.rejects(h.controller.submit({ ...identity, text: 'Invalid', attachments: [{ kind: 'image', dataUrl: 'javascript:alert(1)' }] }), /图片原稿无效/)
  } finally { h.controller.dispose() }
})

test('disconnection and invalid identities never silently fall back to DSH', async () => {
  const h = harness()
  try {
    assert.throws(() => validateExecutionIdentity({ sessionId: '../../foreign', cwd: 'C:\\project' }))
    await h.controller.submit({ ...identity, text: 'Task' })
    h.children[0].emit('close')
    await tick()
    assert.equal(h.controller.status(identity.sessionId).phase, 'failed')
    assert.equal(h.controller.status(identity.sessionId).errorCode, 'processDisconnected')
    assert.ok(h.bridges.some((row) => row.action === 'release'))
    assert.ok(!h.calls.some((row) => row.method === 'dsh/submit'))
  } finally { h.controller.dispose() }
})
