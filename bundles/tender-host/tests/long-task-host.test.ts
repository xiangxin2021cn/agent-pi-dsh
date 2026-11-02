import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { Session, SESSION_FORMAT_VERSION } from '../../../vendor/deepseek-harness/packages/core/session/src/index.ts'
import { createAssistantMessage, createToolResultMessage, createUserMessage } from '../../../vendor/deepseek-harness/packages/llm/llm/src/message.ts'
import { createBusinessProject, updateBusinessProjectContract } from '../../../packages/business-projects/index.ts'
import { bindProjectSession, dispatchFingerprint, loadBoard, saveBoard } from '../src/orchestration.ts'
import { officialStageDir } from '../src/outputs.ts'
import { longTaskStatus, recordLongTaskUsage, startLongTask } from '../src/long-task-runtime.ts'
import { registerLongTaskHost } from '../src/long-task-host.ts'

function fixture(t: any) {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-long-host-')); t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const source = join(cwd, 'source.txt'); writeFileSync(source, 'Original input\n'.repeat(10))
  const project = createBusinessProject({ workspaceRootPath: cwd, module: 'delivery', projectId: 'hosted', name: 'Hosted', rootPath: cwd, createDirectory: false, inputPaths: [source], workflowId: 'delivery-main', workflowSnapshot: { id: 'delivery-main', module: 'delivery', label: 'Host', labelZh: '宿主测试', stages: [{ id: 'first', label: 'First', labelZh: '当前阶段', prompt: 'Only current stage', skillSlugs: [], consumes: [] }] } })
  bindProjectSession(cwd, project, 'main', 'first')
  const path = join(officialStageDir(cwd, project.projectId, 'first'), 'one.md'); mkdirSync(dirname(path), { recursive: true })
  saveBoard(cwd, { schemaVersion: 2, projectId: project.projectId, module: project.module, currentStageId: 'first', stages: { first: { stageId: 'first', status: 'idle', tasks: [{ id: 'one', title: 'Actual output', status: 'queued', markdownPath: path }], updatedAt: new Date().toISOString() } }, updatedAt: new Date().toISOString() })
  const sessions = new Map<string, Session>(), agents = new Map<string, any>(), listeners = new Map<string, Function>(), services = new Map<string, any>()
  let timer: Function = () => {}, flushResult = true, followups = 0
  const warnings: string[] = []
  t.mock.method(globalThis, 'setInterval', (fn: Function) => { timer = fn; return { unref() {} } as any })
  t.mock.method(globalThis, 'clearInterval', () => {})
  const session = (id: string, parentSession?: string) => {
    const row = Session.create(id as any, undefined, { version: SESSION_FORMAT_VERSION, id: id as any, createdAt: Date.now(), cwd, isSeeded: false, ...(parentSession ? { parentSession: parentSession as any, origin: 'subagent' as const } : {}) })
    sessions.set(id, row); return row
  }
  const append = (row: Session, type: any, data: any) => { const event = row.append(type, data, ...(['user/message', 'assistant/message', 'tool/result'].includes(type) ? [{ surfaceOp: 'append' as const }] : [])); listeners.get('session/event')?.(row, event); return event }
  const agent = (id: string, parentSession?: string) => {
    const row = { id, session: session(id, parentSession), status: 'idle', inbox: { hasPending: false }, followup(message: any) { followups++; row.inbox.hasPending = true; append(row.session, 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }) } }
    agents.set(id, row); listeners.get('agent/created')?.({ agent: row }); return row
  }
  const root = agent('main')
  services.set('agents', { get: (id: string) => agents.get(id), list: () => [...agents.values()] })
  services.set('sessions', { get: (id: string) => sessions.get(id), flush: async () => flushResult })
  services.set('sessionQuery', { readSession: async (id: string) => { const row = sessions.get(id)!; return { session: row.header, inheritedEventCount: row.inheritedEventCount, events: Array.from({ length: row.seq }, (_, seq) => row.eventAt(seq as any)) } } })
  services.set('taskGuide', { registerControlPrompt() {}, syncWorkbenchProject() {} })
  const ctx = { get: (name: string) => services.get(name), provide: (name: string, value: any) => services.set(name, value), on: (event: string, fn: Function) => listeners.set(event, fn), emit() {}, logger: { warn(message: string) { warnings.push(message) } }, effect(fn: Function) { const dispose = fn(); t.after(dispose) } }
  const parentOf = (carrier: any) => carrier?.parent
  let host = registerLongTaskHost(ctx, createUserMessage, parentOf)
  const key = dispatchFingerprint(loadBoard(cwd, project.projectId).stages.first!)
  const offer = () => host.offer(cwd, project, 'main', { draft: 'Only the current stage output', dispatch: { stageId: 'first', key } })
  const dispatch = async (limits = {}) => { offer(); return host.dispatch(cwd, project, { sessionId: 'main', stageId: 'first', key, limits }) }
  const consume = (row = root, turn = 1) => {
    const message = longTaskStatus(cwd, project, 'main').attempt!.messageId!
    append(row.session, 'turn/start', { turn }); row.status = 'running'
    listeners.get('agent/inbox/claimed')!({ agent: row, message: { id: message }, turn })
    append(row.session, 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
    const native = Array.from({ length: row.session.seq }, (_, seq) => row.session.eventAt(seq as any)!).flatMap(event => event.type === 'agent/inbox/spliced' ? event.data.inserted : []).find(item => item.id === message)!
    append(row.session, 'user/message', native); row.inbox.hasPending = false
  }
  const finish = (row = root, turn = 1, kind = 'completed') => { append(row.session, 'turn/end', { turn, reason: { kind } }); row.status = 'idle' }
  const model = (row = root, turn = 1, step = 1, attempt = false) => {
    append(row.session, 'step/start', { turn, step })
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    const stream = [{ type: 'chunk', time: Date.now(), chunk: { type: 'usage', usage } }]
    append(row.session, attempt ? 'assistant/attempt' : 'assistant/message', { turn, step, stream, ...(attempt ? {} : { message: createAssistantMessage({ content: [{ type: 'text', text: 'Actual fixture response' }], source: { provider: 'fixture', model: 'fixture' } }), usage }) })
  }
  return { cwd, project, source, path, key, sessions, agents, root, append, agent, listeners, services, offer, dispatch, consume, finish, model, warnings, host: () => host, restart() { host = registerLongTaskHost(ctx, createUserMessage, parentOf) }, flush(value: boolean) { flushResult = value }, get followups() { return followups }, async tick() { timer(); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)) } }
}

function registerRecovery(f: ReturnType<typeof fixture>, unload = true) {
  const stored = structuredClone({ session: f.root.session.header, inheritedEventCount: f.root.session.inheritedEventCount, events: Array.from({ length: f.root.session.seq }, (_, seq) => f.root.session.eventAt(seq as any)!) })
  const loads: string[] = [], creates: string[] = []
  const registry = { list: () => [{ path: f.cwd, sessionIds: ['main'] }], archivedSessionIds: [] as string[] }
  const readLive = f.services.get('sessionQuery').readSession
  f.services.set('workspaceRegistry', registry)
  f.services.set('sessionQuery', { readSession: async (id: string) => f.sessions.has(id) ? readLive(id) : structuredClone(stored) })
  f.services.set('sessionController', {
    async resolveAgent(id: string) {
      loads.push(id); assert.equal(id, 'main', 'recovery must name the registered original Session')
      const restored = structuredClone(stored)
      f.root.session = Session.fromRestore(id as any, restored.events, restored.session, restored.inheritedEventCount, 'detached')
      f.sessions.set(id, f.root.session); f.agents.set(id, f.root)
      f.listeners.get('agent/created')?.({ agent: f.root, source: 'resume' })
      return { agent: f.root }
    },
    async create(input: any) { creates.push(String(input?.sessionId)); throw new Error('Recovery must never create a blank Session') },
  })
  if (unload) { f.agents.delete('main'); f.sessions.delete('main') }
  f.restart()
  return { stored, loads, creates, registry }
}

test('external lifecycle uses the exact scoped parent and fences repeat dispatch until native completion', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  const info = { id: 'external-one', runId: 'activation-one', provider: 'oar-codex', local: false }
  f.listeners.get('subagent/start')!.call({ parent: { ...f.root } }, info)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').external, undefined, 'a stale parent identity cannot author a receipt')
  f.append(f.root.session, 'subagent/catalog', { version: 2, mode: 'external', childId: info.id, childCreatedAt: Date.now() })
  f.listeners.get('subagent/start')!.call({ parent: f.root }, info)
  f.finish(); await f.tick()
  const waiting = await f.host().status(f.cwd, f.project, 'main')
  assert.deepEqual(waiting.external!.pending, [info.id]); assert.equal(waiting.external!.unreportedTokens, true)
  assert.equal(f.followups, 1); assert.equal(waiting.run!.usage.tokens, 0)
  f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...info, stopReason: 'completed' })
  const settled = await f.host().status(f.cwd, f.project, 'main')
  assert.deepEqual(settled.external!.pending, []); assert.deepEqual(settled.external!.needsReview, [])
})

test('restored native external catalog and notice remain reviewable and automatic notices obey pause', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  f.append(f.root.session, 'subagent/catalog', { version: 2, mode: 'external', childId: 'external-restored', childCreatedAt: Date.now() })
  f.finish(); f.restart()
  const notice = createUserMessage({ content: [{ type: 'text', text: 'Native output is available' }], source: { kind: 'subagent-settled', form: 'notice', senderSessionId: 'external-restored' } } as any)
  f.append(f.root.session, 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [notice] })
  const status = await f.host().status(f.cwd, f.project, 'main')
  assert.deepEqual(status.external!.pending, []); assert.deepEqual(status.external!.needsReview, ['external-restored'])
  assert.equal(status.phase, 'needs_review'); assert.equal(f.followups, 1)
  f.host().pause(f.cwd, f.project, 'main', true)
  const decision = await f.listeners.get('agent/pre-step')!({ agent: f.root, turn: 2, messages: [notice] }, () => ({ kind: 'enter' }))
  assert.equal(decision.kind, 'reject')
})

test('pause interrupts only recorded external children and joins their exact direct parents', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); const child = f.agent('native-child', 'main')
  const info = { id: 'external-nested', runId: 'activation-nested', provider: 'oar-claude', local: false }
  f.listeners.get('subagent/start')!.call({ parent: child }, info)
  const interruptions: any[] = [], drains: any[] = []
  f.services.set('subagents', {
    interrupt(id: string, authority: any) { interruptions.push([id, authority]); f.listeners.get('subagent/end')!.call({ parent: child }, { ...info, stopReason: 'aborted' }) },
    async drainChildren(parent: any, ids: string[]) { drains.push([parent, ids]) },
    drainDescendants() { assert.fail('resumable pause must not permanently close descendant admission') },
  })
  f.host().pause(f.cwd, f.project, 'main', true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(interruptions.length, 1); assert.equal(interruptions[0][0], info.id)
  assert.equal(interruptions[0][1].agent, f.root); assert.equal(interruptions[0][1].kind, 'ancestor')
  assert.equal(drains.length, 1); assert.equal(drains[0][0], child); assert.deepEqual(drains[0][1], [info.id])
  assert.deepEqual(longTaskStatus(f.cwd, f.project, 'main').external!.pending, [])
})

test('parallel synchronous terminal callbacks share one owned cancellation transaction', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  const infos = ['external-a', 'external-b'].map(id => ({ id, runId: 'activation-' + id, provider: 'oar-codex', local: false }))
  for (const info of infos) f.listeners.get('subagent/start')!.call({ parent: f.root }, info)
  const interrupted: string[] = [], drained: string[][] = []
  f.services.set('subagents', {
    interrupt(id: string, authority: any) {
      assert.equal(authority.agent, f.root); interrupted.push(id)
      f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...infos.find(info => info.id === id)!, stopReason: 'aborted' })
    },
    async drainChildren(parent: any, ids: string[]) { assert.equal(parent, f.root); drained.push(ids) },
  })
  f.host().pause(f.cwd, f.project, 'main')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(interrupted, infos.map(info => info.id), 'reentrant end events cannot signal a sibling twice')
  assert.deepEqual(drained, [infos.map(info => info.id)])
  assert.deepEqual(longTaskStatus(f.cwd, f.project, 'main').external!.pending, [])
})

test('a newly published owned child during pause cleanup receives its own precise cancellation', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  const a = { id: 'external-a', runId: 'activation-a', provider: 'oar-codex', local: false }
  const b = { id: 'external-b', runId: 'activation-b', provider: 'oar-claude', local: false }
  f.listeners.get('subagent/start')!.call({ parent: f.root }, a)
  const release = Promise.withResolvers<void>(), interrupted: string[] = [], drained: string[][] = []
  f.services.set('subagents', {
    interrupt(id: string) { interrupted.push(id) },
    async drainChildren(parent: any, ids: string[]) {
      assert.equal(parent, f.root); drained.push(ids)
      if (ids.includes(a.id)) await release.promise
      for (const id of ids) f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...(id === a.id ? a : b), stopReason: 'aborted' })
    },
  })
  f.host().pause(f.cwd, f.project, 'main')
  await waitForHost(() => drained.length === 1)
  f.listeners.get('subagent/start')!.call({ parent: f.root }, b)
  release.resolve()
  await waitForHost(() => interrupted.includes(b.id))
  assert.deepEqual(interrupted, [a.id, b.id])
  await waitForHost(() => longTaskStatus(f.cwd, f.project, 'main').external!.pending.length === 0)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, true)
})

test('a completed old cleanup cannot cancel a worker from a newly authorized attempt', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  const old = { id: 'old-cleanup', runId: 'activation-old-cleanup', provider: 'oar-codex', local: false }
  const next = { id: 'new-authorized', runId: 'activation-new-authorized', provider: 'oar-claude', local: false }
  f.listeners.get('subagent/start')!.call({ parent: f.root }, old)
  const release = Promise.withResolvers<void>(), interrupted: string[] = [], drained: string[][] = []
  f.services.set('subagents', {
    interrupt(id: string) { interrupted.push(id) },
    async drainChildren(_parent: any, ids: string[]) { drained.push(ids); if (ids.includes(old.id)) await release.promise },
  })
  f.host().pause(f.cwd, f.project, 'main')
  await waitForHost(() => drained.length === 1)
  f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...old, stopReason: 'completed' })
  f.finish()
  const oldAttempt = longTaskStatus(f.cwd, f.project, 'main').attempt!.id
  f.host().pause(f.cwd, f.project, 'main', false)
  await f.dispatch(); f.consume(f.root, 2)
  assert.notEqual(longTaskStatus(f.cwd, f.project, 'main').attempt!.id, oldAttempt)
  f.listeners.get('subagent/start')!.call({ parent: f.root }, next)
  release.resolve()
  await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(interrupted, [old.id], 'old cancellation does not carry into the explicit resumed authorization')
  assert.deepEqual(longTaskStatus(f.cwd, f.project, 'main').external!.pending, [next.id])
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, false)
})

test('an unregistered external end cannot be adopted by a settled or newly dispatched attempt', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); f.finish()
  const previous = longTaskStatus(f.cwd, f.project, 'main').attempt!.id
  const unknown = { id: 'unregistered-old-worker', runId: 'activation-unregistered', provider: 'oar-codex', local: false, stopReason: 'error' }
  f.listeners.get('subagent/end')!.call({ parent: f.root }, unknown)
  let state = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(state.external, undefined, 'a scoped parent without a registered start/catalog does not prove attempt ownership')
  assert.equal(state.run!.paused, false)
  await f.dispatch(); f.consume(f.root, 2)
  f.listeners.get('subagent/end')!.call({ parent: f.root }, unknown)
  state = longTaskStatus(f.cwd, f.project, 'main')
  assert.notEqual(state.attempt!.id, previous)
  assert.ok(state.run!.attempts.every(attempt => attempt.externalChildren?.[unknown.id] === undefined))
  assert.equal(state.run!.paused, false, 'an unrelated failure does not pause the authorized new attempt')
})

test('a failed targeted interrupt does not throw from pause or prevent other owned children from stopping', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  const infos = ['unconfirmed', 'confirmed'].map(id => ({ id, runId: 'activation-' + id, provider: 'oar-codex', local: false }))
  for (const info of infos) f.listeners.get('subagent/start')!.call({ parent: f.root }, info)
  const interrupted: string[] = []
  f.services.set('subagents', {
    interrupt(id: string) { interrupted.push(id); if (id === 'unconfirmed') throw new Error('Exact ancestry could not be confirmed') },
    async drainChildren(parent: any, ids: string[]) {
      assert.equal(parent, f.root); assert.deepEqual(ids, infos.map(info => info.id))
      f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...infos[1], stopReason: 'aborted' })
      throw new Error('One selected cleanup remains unconfirmed')
    },
  })
  assert.doesNotThrow(() => f.host().pause(f.cwd, f.project, 'main'))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(interrupted, infos.map(info => info.id))
  assert.deepEqual(longTaskStatus(f.cwd, f.project, 'main').external!.pending, ['unconfirmed'])
  assert.ok(f.warnings.length)
  assert.equal(f.followups, 1)
})

test('a failed child is not retried when the same cleanup wave stops a late worker', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  const a = { id: 'failed-cleanup', runId: 'activation-failed-cleanup', provider: 'oar-codex', local: false }
  const b = { id: 'late-cleanup', runId: 'activation-late-cleanup', provider: 'oar-claude', local: false }
  f.listeners.get('subagent/start')!.call({ parent: f.root }, a)
  const release = Promise.withResolvers<void>(), interrupted: string[] = [], drained: string[][] = []
  f.services.set('subagents', {
    interrupt(id: string) { interrupted.push(id) },
    async drainChildren(_parent: any, ids: string[]) {
      drained.push(ids)
      if (ids.includes(a.id)) { await release.promise; throw new Error('Original cleanup remains unconfirmed') }
      f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...b, stopReason: 'completed' })
    },
  })
  f.host().pause(f.cwd, f.project, 'main')
  await waitForHost(() => drained.length === 1)
  f.listeners.get('subagent/start')!.call({ parent: f.root }, b)
  release.resolve()
  await waitForHost(() => drained.length === 2)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(interrupted, [a.id, b.id])
  assert.deepEqual(drained, [[a.id], [b.id]], 'the late worker does not reschedule the failed original cleanup')
  assert.deepEqual(longTaskStatus(f.cwd, f.project, 'main').external!.pending, [a.id])
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, true)
})

test('pause or actual budget exhaustion during an async pre-step check cannot admit another model round', async t => {
  for (const reason of ['pause', 'budget'] as const) {
    const f = fixture(t); await f.dispatch({ maxTokens: 15 }); f.consume()
    const messageId = longTaskStatus(f.cwd, f.project, 'main').attempt!.messageId
    let entered = 0
    const pending = f.listeners.get('agent/pre-step')!({ agent: f.root, turn: 1, messages: [{ id: messageId }] }, () => { entered++; return { kind: 'enter' } })
    if (reason === 'pause') f.host().pause(f.cwd, f.project, 'main')
    else f.model()
    assert.equal((await pending).kind, 'reject', `${reason} takes effect before the awaited gate commits`)
    assert.equal(entered, 0)
  }
})

test('a native settlement-driven turn keeps the automatic budget gate on later steps with no new messages', async t => {
  const f = fixture(t); await f.dispatch({ maxTokens: 15 }); f.consume()
  const info = { id: 'completed-external', runId: 'activation-completed', provider: 'oar-codex', local: false }
  f.listeners.get('subagent/start')!.call({ parent: f.root }, info)
  f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...info, stopReason: 'completed' }); f.finish()
  const notice = createUserMessage({ content: [{ type: 'text', text: 'Original external result' }], source: { kind: 'subagent-settled', form: 'notice', senderSessionId: info.id } } as any)
  f.append(f.root.session, 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [notice] })
  f.append(f.root.session, 'turn/start', { turn: 2 }); f.root.status = 'running'
  f.listeners.get('agent/inbox/claimed')!({ agent: f.root, message: notice, turn: 2 })
  f.append(f.root.session, 'user/message', notice)
  const preStep = f.listeners.get('agent/pre-step')!
  assert.equal((await preStep({ agent: f.root, turn: 2, messages: [notice] }, () => ({ kind: 'enter' }))).kind, 'enter')
  f.model(f.root, 2, 1)
  assert.equal((await preStep({ agent: f.root, turn: 2, messages: [] }, () => ({ kind: 'enter' }))).kind, 'reject')
  assert.equal(f.followups, 1)
})

test('a native settlement queued before catalog replay cannot bypass an exhausted budget or adopt its unknown sender', async t => {
  const f = fixture(t); await f.dispatch({ maxTokens: 15 }); f.consume()
  f.root.session.append('subagent/catalog' as any, { version: 2, mode: 'external', childId: 'unindexed-external', childCreatedAt: Date.now() } as any)
  f.model(); f.finish()
  const notice = createUserMessage({ content: [{ type: 'text', text: 'Unindexed native result' }], source: { kind: 'subagent-settled', form: 'notice', senderSessionId: 'unindexed-external' } } as any)
  const before = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(before.external, undefined, 'the new host has not yet indexed its native catalog')
  const decision = await f.listeners.get('agent/pre-step')!({ agent: f.root, turn: 2, messages: [notice] }, () => ({ kind: 'enter' }))
  assert.equal(decision.kind, 'reject')
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').external, undefined, 'budget classification does not forge sender ownership')
  assert.equal(f.followups, 1)
})

test('a shared-task pause or a native executor handoff stops already owned external work at the next step gate', async t => {
  for (const reason of ['task-pause', 'native-handoff'] as const) {
    const f = fixture(t); await f.dispatch(); f.consume()
    const info = { id: 'owned-external', runId: 'activation-owned', provider: 'oar-codex', local: false }
    f.listeners.get('subagent/start')!.call({ parent: f.root }, info)
    const interrupted: string[] = []
    f.services.set('subagents', { interrupt(id: string, authority: any) { assert.equal(authority.agent, f.root); interrupted.push(id) }, async drainChildren() {} })
    if (reason === 'task-pause') f.services.get('taskGuide').read = () => ({ control: { paused: true } })
    else f.services.set('nativeTaskExecutor', { status: () => ({ active: true }) })
    const messageId = longTaskStatus(f.cwd, f.project, 'main').attempt!.messageId
    const decision = await f.listeners.get('agent/pre-step')!({ agent: f.root, turn: 1, messages: [{ id: messageId }] }, () => ({ kind: 'enter' }))
    assert.equal(decision.kind, 'reject')
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(interrupted, [info.id])
    assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, true)
  }
})

test('an external worker is stopped after native usage blocks the task even when its parent has no next step', async t => {
  const f = fixture(t); await f.dispatch({ maxTokens: 15 }); f.consume()
  const info = { id: 'over-budget-external', runId: 'activation-budget', provider: 'oar-codex', local: false }
  f.listeners.get('subagent/start')!.call({ parent: f.root }, info)
  const interrupted: string[] = []
  f.services.set('subagents', { interrupt(id: string) { interrupted.push(id) }, async drainChildren() {} })
  f.model(); f.finish(); await f.tick()
  assert.deepEqual(interrupted, [info.id])
  assert.equal(f.followups, 1)
  assert.deepEqual(longTaskStatus(f.cwd, f.project, 'main').external!.pending, [info.id], 'a successful stop request is not a terminal receipt')
})

test('review-only unknown effects stop owned workers and include a late child without inventing a terminal receipt', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  const a = { id: 'review-a', runId: 'activation-review-a', provider: 'oar-codex', local: false }
  const b = { id: 'review-b', runId: 'activation-review-b', provider: 'oar-claude', local: false }
  f.listeners.get('subagent/start')!.call({ parent: f.root }, a)
  f.append(f.root.session, 'tool/call', { turn: 1, step: 1, callId: 'unknown-side-effect', name: 'external_action', arguments: '{}' })
  const release = Promise.withResolvers<void>(), interrupted: string[] = [], drained: string[][] = []
  f.services.set('subagents', {
    interrupt(id: string) { interrupted.push(id) },
    async drainChildren(parent: any, ids: string[]) {
      assert.equal(parent, f.root); drained.push(ids)
      if (ids.includes(a.id)) await release.promise
      for (const id of ids) f.listeners.get('subagent/end')!.call({ parent: f.root }, { ...(id === a.id ? a : b), stopReason: 'completed' })
    },
  })
  f.finish(); await f.tick(); await waitForHost(() => drained.length === 1)
  f.append(f.root.session, 'subagent/catalog', { version: 2, mode: 'external', childId: b.id, childCreatedAt: Date.now() })
  release.resolve()
  await waitForHost(() => interrupted.includes(b.id))
  await waitForHost(() => longTaskStatus(f.cwd, f.project, 'main').external!.pending.length === 0)
  assert.deepEqual(interrupted, [a.id, b.id])
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, false)
  const review = await f.host().status(f.cwd, f.project, 'main')
  assert.equal(review.phase, 'needs_review'); assert.match(review.reason, /工具操作结果未知/)
  assert.equal(f.followups, 1)
})

test('recovery attributes a missed external catalog to its consumed original attempt instead of an older turn', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); f.model(); f.finish(); await f.tick()
  const attempt = longTaskStatus(f.cwd, f.project, 'main').attempt!
  f.consume(f.root, 2)
  f.root.session.append('subagent/catalog' as any, { version: 2, mode: 'external', childId: 'second-turn-external', childCreatedAt: Date.now() } as any)
  f.finish(f.root, 2); f.restart()
  const restored = await f.host().status(f.cwd, f.project, 'main')
  assert.equal(restored.run!.paused, false)
  assert.equal(restored.run!.attempts[0].externalChildren?.['second-turn-external'], undefined)
  assert.ok(restored.run!.attempts.find(row => row.id === attempt.id)!.externalChildren!['second-turn-external'])
  assert.deepEqual(restored.external!.pending, ['second-turn-external'])
  assert.equal(f.followups, 2)
})

async function waitForHost(predicate: () => boolean) {
  for (let count = 0; count < 40; count++) {
    if (predicate()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.ok(predicate(), 'expected the host recovery transaction to settle')
}

test('trusted exact previews dispatch one native identified message; client text cannot replace the draft', async t => {
  const f = fixture(t)
  await assert.rejects(() => f.host().dispatch(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key, draft: 'fake' }), /宿主登记/)
  const started = await f.dispatch()
  assert.equal(started.attempt!.status, 'dispatched'); assert.equal(f.followups, 1)
  assert.equal(f.root.session.eventAt(0 as any)!.type, 'agent/inbox/spliced')
  await assert.rejects(() => f.dispatch(), /空闲/)
})

test('native numeric events and streamed failed-attempt usage aggregate and replay without double counting', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); f.model(); f.model(f.root, 1, 2, true); f.finish()
  const before = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(before.run!.usage.tokens, 30); assert.equal(before.run!.usage.rounds, 2); assert.equal(before.cost, 'unknown')
  assert.equal(before.attempt!.status, 'settled')
  f.restart(); await f.host().status(f.cwd, f.project, 'main'); await f.host().status(f.cwd, f.project, 'main')
  const after = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(after.run!.usage.tokens, 30); assert.equal(after.run!.noProgress, 1)
})

test('abort/error receipts pause automatic continuation, while human corrections are still admissible', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); f.finish(f.root, 1, 'aborted')
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').phase, 'paused')
  await f.tick(); assert.equal(f.followups, 1)
  const correction = createUserMessage({ content: [{ type: 'text', text: 'Correct the output scope' }], source: { kind: 'human' } } as any)
  const decision = await f.listeners.get('agent/pre-step')!({ agent: f.root, turn: 2, messages: [correction] }, () => ({ kind: 'enter', messages: [correction] }))
  assert.equal(decision.kind, 'enter')
  f.host().pause(f.cwd, f.project, 'main', false)
  f.root.inbox.hasPending = true; await f.tick(); assert.equal(f.followups, 1)
})

test('false durability checkpoints never claim a dispatch; replay cannot confirm a live-only message', async t => {
  const f = fixture(t); f.flush(false)
  await assert.rejects(() => f.dispatch(), /持久化/)
  assert.equal(f.followups, 0); assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.status, 'prepared')
  f.flush(true)
  let count = 0
  f.services.get('sessions').flush = async () => ++count < 2
  await assert.rejects(() => f.host().dispatch(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key }), /持久化/)
  assert.equal(f.followups, 0)
  // Fail the checkpoint after enqueue, preserving intent and the actual native message identity.
  f.root.inbox.hasPending = false; count = 0; f.services.get('sessions').flush = async () => ++count < 3
  await assert.rejects(() => f.host().dispatch(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key }), /派发后的持久化/)
  assert.equal(f.followups, 1); assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.status, 'dispatching')
  await assert.rejects(() => f.host().status(f.cwd, f.project, 'main'), /持久化/)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.status, 'dispatching')
})

test('child actual usage and expected-output receipts survive host restart and duplicate end notifications', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); const child = f.agent('child', 'main')
  f.host().registerAssignments(f.cwd, f.project, 'main', [{ childSessionId: 'child', expectedOutput: f.path }])
  f.append(child.session, 'turn/start', { turn: 1 }); child.status = 'running'; f.model(child)
  writeFileSync(f.path, '# Actual child output\n\n' + 'Supported source facts and disclosed gaps.\n'.repeat(8))
  f.finish(child); f.finish()
  const before = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(before.run!.usage.tokens, 15); assert.equal(before.run!.submissions.length, 1); assert.equal(before.run!.submissions[0]!.status, 'received')
  f.restart(); await f.host().status(f.cwd, f.project, 'main'); await f.host().status(f.cwd, f.project, 'main')
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.usage.tokens, 15)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.submissions.length, 1)
})

test('actual child consumption exhausts the shared budget and rejects its next native step', async t => {
  const f = fixture(t); await f.dispatch({ maxTokens: 15 }); const child = f.agent('child', 'main')
  f.append(child.session, 'turn/start', { turn: 1 }); f.model(child)
  const decision = await f.listeners.get('agent/pre-step')!({ agent: child, turn: 1, messages: [] }, () => ({ kind: 'enter' }))
  assert.equal(decision.kind, 'reject'); assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.usage.tokens, 15)
})

test('unknown external tool outcomes block continuation; a real successful result pairs by native toolCallId', async t => {
  const f = fixture(t); await f.dispatch(); f.consume()
  f.append(f.root.session, 'tool/call', { turn: 1, step: 1, callId: 'external', name: 'exec', arguments: '{}' })
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.pendingToolCalls!.length, 1)
  f.append(f.root.session, 'tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: 'external' as any, content: [{ type: 'text', text: 'Actual tool success' }], isError: false }) })
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.pendingToolCalls!.length, 0)
  f.append(f.root.session, 'tool/call', { turn: 1, step: 1, callId: 'unresolved', name: 'exec', arguments: '{}' })
  f.finish(); assert.equal((await f.host().status(f.cwd, f.project, 'main')).phase, 'needs_review')
  await f.tick(); assert.equal(f.followups, 1)
})

test('source changes invalidate a trusted offer, and a legacy sent draft is only reviewed', async t => {
  const f = fixture(t); f.offer(); writeFileSync(f.source, 'Replacement source')
  await assert.rejects(() => f.host().dispatch(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key }), /预览已过期/)
  const other = fixture(t), board = loadBoard(other.cwd, other.project.projectId)
  board.stages.first!.dispatch = { key: other.key, offeredAt: new Date().toISOString(), dispatchedAt: new Date().toISOString() }; saveBoard(other.cwd, board); other.offer()
  await assert.rejects(() => other.host().dispatch(other.cwd, other.project, { sessionId: 'main', stageId: 'first', key: other.key }), /旧派发/)
  assert.equal(other.followups, 0)
})

test('the host timer continues only the explicitly dispatched stage after a real native completion', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); f.model(); f.finish()
  await f.tick()
  assert.equal(f.followups, 2)
  const status = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(status.attempt!.stageId, 'first'); assert.equal(status.run!.attempts.length, 2)
  assert.equal(status.attempt!.status, 'dispatched')
})

test('a crash after native enqueue recovers the identified receipt without sending a second message', async t => {
  const f = fixture(t)
  let checkpoints = 0
  f.services.get('sessions').flush = async () => ++checkpoints === 1
  await assert.rejects(() => f.dispatch(), /派发后的持久化/)
  const id = longTaskStatus(f.cwd, f.project, 'main').attempt!.messageId
  assert.equal(f.followups, 1)
  f.services.get('sessions').flush = async () => true; f.restart()
  const status = await f.host().status(f.cwd, f.project, 'main')
  assert.equal(status.attempt!.messageId, id); assert.equal(status.attempt!.status, 'dispatched')
  await f.tick(); assert.equal(f.followups, 1)
})

test('late old-child events stay in the old attempt after a fresh parent dispatch', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); const old = f.agent('old-child', 'main')
  f.host().registerAssignments(f.cwd, f.project, 'main', [{ childSessionId: 'old-child', expectedOutput: f.path }])
  f.append(old.session, 'turn/start', { turn: 1 }); f.model(old); f.finish(old); f.finish()
  await f.tick()
  const current = longTaskStatus(f.cwd, f.project, 'main').attempt!
  assert.equal(current.children['old-child'], undefined)
  f.model(old, 1, 2)
  f.finish(old, 1)
  const status = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(status.run!.usage.tokens, 30); assert.equal(status.attempt!.children['old-child'], undefined)
  f.restart(); await f.host().status(f.cwd, f.project, 'main')
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.children['old-child'], undefined)
})

test('host timer reloads the current project contract instead of using its watched snapshot', async t => {
  const f = fixture(t); await f.dispatch(); f.consume(); f.model(); f.finish()
  updateBusinessProjectContract(f.cwd, f.project.module, f.project.projectId, { projectGoal: 'New explicit user goal' })
  await f.tick()
  assert.equal(f.followups, 1)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.status, 'stale')
})

test('prepared stage preview exposes the original host draft and rejects changed input bytes', async t => {
  const f = fixture(t)
  f.offer()
  const prepared = await f.host().prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key })
  assert.equal(prepared.draft, 'Only the current stage output')
  assert.deepEqual(prepared.dispatch, { stageId: 'first', key: f.key })
  writeFileSync(f.source, 'Different source version invalidates the prepared preview')
  await assert.rejects(() => f.host().prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key }), /预览已过期|未由宿主登记/)
  assert.equal(f.followups, 0, 'reading a prepared draft never dispatches an executor')
})


test('settled stage recovery survives a paused restart without an in-memory or recent offer', async t => {
  const f = fixture(t)
  await f.dispatch(); f.consume(); f.model(); f.finish()
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.status, 'settled')
  f.host().pause(f.cwd, f.project, 'main', true)
  f.restart()
  const prepared = await f.host().prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key })
  assert.notEqual(prepared.dispatch.key, f.key, 'reconciled recovery uses the current host attempt identity')
  assert.equal(prepared.dispatch.stageId, 'first')
  assert.match(prepared.draft, /宿主只授权本阶段的剩余工作/)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, true, 'read-only native preparation preserves DSH automatic suspension')
  assert.equal(f.followups, 1, 'preparing recovery never starts another executor')
  f.host().pause(f.cwd, f.project, 'main', false)
  const resumed = await f.host().dispatch(f.cwd, f.project, { sessionId: 'main', ...prepared.dispatch })
  assert.equal(resumed.attempt!.status, 'dispatched')
  assert.equal(f.followups, 2)
})

test('prepared recovery accepts a durable ready host attempt when the board still has its old dispatch key', async t => {
  const f = fixture(t)
  await f.dispatch(); f.consume(); f.model(); f.finish()
  const ready = await f.host().status(f.cwd, f.project, 'main')
  assert.equal(ready.phase, 'ready')
  assert.notEqual(ready.attempt!.key, f.key)
  assert.equal(loadBoard(f.cwd, f.project.projectId, f.project.module).stages.first!.dispatch!.key, f.key)
  f.host().pause(f.cwd, f.project, 'main', true)
  f.restart()
  const prepared = await f.host().prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key })
  assert.equal(prepared.dispatch.key, ready.attempt!.key)
  assert.equal(prepared.draft, ready.attempt!.draft)
  assert.equal(f.followups, 1)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, true)
})

test('prepared recovery cannot bypass unknown tool effects or an exhausted shared budget', async t => {
  const unknown = fixture(t)
  await unknown.dispatch(); unknown.consume()
  unknown.append(unknown.root.session, 'tool/call', { turn: 1, step: 1, callId: 'pending-effect', name: 'external_action', arguments: '{}' })
  unknown.finish(); unknown.host().pause(unknown.cwd, unknown.project, 'main', true)
  unknown.restart()
  await assert.rejects(() => unknown.host().prepared(unknown.cwd, unknown.project, 'main', { stageId: 'first', key: unknown.key }), /结果未知|操作结果未知/)
  assert.equal(unknown.followups, 1)
  assert.equal(longTaskStatus(unknown.cwd, unknown.project, 'main').run!.paused, true)
  const budget = fixture(t)
  await budget.dispatch({ maxTokens: 15 }); budget.consume(); budget.model(); budget.finish()
  budget.host().pause(budget.cwd, budget.project, 'main', true)
  await assert.rejects(() => budget.host().prepared(budget.cwd, budget.project, 'main', { stageId: 'first', key: budget.key }), /预算|token|Token/)
  assert.equal(budget.followups, 1)
  assert.equal(longTaskStatus(budget.cwd, budget.project, 'main').run!.paused, true)
})


test('a fresh valid offer cannot bypass an idle child without its settlement receipt', async t => {
  const f = fixture(t)
  await f.dispatch(); f.consume()
  const child = f.agent('unsettled-child', 'main')
  f.host().registerAssignments(f.cwd, f.project, 'main', [{ childSessionId: child.id, expectedOutput: f.path }])
  f.model(); f.finish()
  assert.equal(child.status, 'idle')
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.status, 'settled')
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.children[child.id]!.settledAt, undefined)
  f.host().pause(f.cwd, f.project, 'main', true)
  f.offer()
  await assert.rejects(() => f.host().prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key }), /子会话|结算/)
  assert.equal(f.followups, 1)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.attempts.length, 1)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, true)
  f.host().pause(f.cwd, f.project, 'main', false)
  await assert.rejects(() => f.host().dispatch(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key, limits: { maxRounds: 100 } }), /尚未核对结算/)
  assert.equal(f.followups, 1, 'the original runtime dispatch entry also respects unsettled child receipts')
})


test('explicit host limits apply to an already ready attempt without resetting its identity or usage', async t => {
  const f = fixture(t); f.offer()
  const ready = startLongTask(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key, draft: 'Only the current stage output' })
  const activeLimits = { maxRounds: 5, maxTokens: 125, maxElapsedMs: 9000, maxNoProgress: 2 }
  const limits = { ...activeLimits, maxCostUsd: 0.75 }
  const dispatched = await f.host().dispatch(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key, limits })
  assert.deepEqual(dispatched.run!.limits, activeLimits, 'legacy amount inputs impose no currency ceiling')
  assert.equal(dispatched.attempt!.id, ready.attempt!.id)
  assert.deepEqual(dispatched.run!.usage, ready.run!.usage)
  assert.equal(f.followups, 1)
})

test('explicit limit updates preserve all actual usage and no-progress receipts through exhausted recovery', async t => {
  const f = fixture(t), limits = { maxRounds: 1, maxTokens: 15, maxElapsedMs: 10, maxNoProgress: 1 }
  await f.dispatch({ ...limits, maxCostUsd: 0.2 }); f.consume()
  recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'actual-provider-usage', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.2, elapsedMs: 10 })
  f.finish(); f.host().pause(f.cwd, f.project, 'main', true)
  const before = longTaskStatus(f.cwd, f.project, 'main').run!
  await assert.rejects(() => f.host().prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key }), /预算/)
  assert.deepEqual(longTaskStatus(f.cwd, f.project, 'main').run!.limits, limits, 'no explicit input increases a ceiling')
  const updated = f.host().setLimits(f.cwd, f.project, 'main', { maxRounds: 3, maxTokens: 50, maxElapsedMs: 30, maxNoProgress: 2, maxCostUsd: 0.4 })
  assert.equal(updated.run!.limits.maxCostUsd, undefined, 'updating limits does not restore a legacy currency ceiling')
  assert.deepEqual(updated.run!.usage, before.usage)
  assert.deepEqual(updated.run!.usageReceipts, before.usageReceipts)
  assert.equal(updated.run!.noProgress, before.noProgress)
  assert.equal(updated.attempt!.id, before.currentAttemptId)
  assert.equal(updated.run!.paused, true)
  const recovered = await f.host().prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key })
  f.host().pause(f.cwd, f.project, 'main', false)
  const resumed = await f.host().dispatch(f.cwd, f.project, { sessionId: 'main', ...recovered.dispatch })
  assert.equal(resumed.attempt!.status, 'dispatched')
  assert.deepEqual(resumed.run!.usage, before.usage)
  assert.equal(resumed.run!.noProgress, before.noProgress)
  assert.equal(f.followups, 2)
})

test('host budget updates reject foreign bindings and every unsupported or invalid budget value', t => {
  const f = fixture(t)
  const invalid = [null, [], 1, { unknown: 1 }, { maxRounds: 0 }, { maxRounds: null }, { maxTokens: -1 }, { maxElapsedMs: Infinity }, { maxNoProgress: NaN }, { maxRounds: 1.5 }, { maxTokens: 1.5 }, { maxElapsedMs: 1.5 }, { maxNoProgress: 1.5 }, { maxCostUsd: '1' }]
  for (const limits of invalid) assert.throws(() => f.host().setLimits(f.cwd, f.project, 'main', limits), /无效执行预算/)
  assert.throws(() => f.host().setLimits(f.cwd, f.project, 'foreign', { maxRounds: 5 }), /绑定/)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run, undefined)
  assert.equal(f.followups, 0)
})

test('registered-workspace recovery resumes the original unloaded native Session and continues only its authorized stage', async t => {
  const f = fixture(t)
  await f.dispatch(); f.consume(); f.model(); f.finish()
  const before = longTaskStatus(f.cwd, f.project, 'main'), recovery = registerRecovery(f)
  assert.equal(before.attempt!.context!.rootSessionId, 'main', 'host-produced context is durable in the original run')
  assert.equal(f.agents.has('main'), false)
  await f.tick(); await waitForHost(() => f.followups === 2)
  assert.deepEqual(recovery.loads, ['main']); assert.deepEqual(recovery.creates, [])
  assert.equal(f.root.session.id, 'main'); assert.equal(f.root.session.header.cwd, f.cwd)
  assert.deepEqual([...f.sessions.keys()], ['main'])
  const after = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(after.attempt!.stageId, 'first'); assert.equal(after.attempt!.context!.rootSessionId, 'main')
  assert.notEqual(after.attempt!.id, before.attempt!.id)
  assert.deepEqual(after.run!.usage, before.run!.usage, 'recovery does not reset actual consumption')
  assert.deepEqual(f.warnings, [])
})

test('paused, archived and budget-exhausted registered roots are not activated after restart', async t => {
  for (const reason of ['paused', 'archived', 'budget'] as const) {
    const f = fixture(t)
    await f.dispatch(reason === 'budget' ? { maxTokens: 15 } : {}); f.consume(); f.model(); f.finish()
    if (reason === 'paused') f.host().pause(f.cwd, f.project, 'main', true)
    const recovery = registerRecovery(f)
    if (reason === 'archived') recovery.registry.archivedSessionIds.push('main')
    await f.tick(); await f.tick()
    assert.deepEqual(recovery.loads, [], `${reason} must not load an Agent`)
    assert.deepEqual(recovery.creates, []); assert.equal(f.followups, 1)
    assert.equal(f.agents.has('main'), false)
    if (reason === 'paused') assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.paused, true)
  }
})

test('a restored pending native inbox retains its existing message and waits for actual consumption before continuation', async t => {
  const f = fixture(t)
  await f.dispatch()
  const before = longTaskStatus(f.cwd, f.project, 'main'), originalMessageId = before.attempt!.messageId
  const recovery = registerRecovery(f)
  await f.tick(); await f.tick()
  assert.deepEqual(recovery.loads, ['main']); assert.deepEqual(recovery.creates, [])
  assert.equal(f.followups, 1, 'restoring an existing queued message must not followup it again')
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.messageId, originalMessageId)
  const restoredEvents = Array.from({ length: f.root.session.seq }, (_, seq) => f.root.session.eventAt(seq as any)!)
  assert.deepEqual(restoredEvents.slice(0, recovery.stored.events.length), recovery.stored.events)
  assert.ok(restoredEvents.slice(recovery.stored.events.length).every(event => event.type === 'session/end-seed'), 'only the native resume marker may be added; no synthetic input or duplicate queue item')
  f.consume(); f.model(); f.finish()
  await f.tick(); await waitForHost(() => f.followups === 2)
  const after = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(after.run!.attempts.length, 2); assert.equal(after.attempt!.stageId, 'first')
  assert.notEqual(after.attempt!.messageId, originalMessageId)
  assert.deepEqual(recovery.loads, ['main'], 'the already restored root is not loaded a second time')
})

test('recovery refuses a durable same-id different-payload dispatch without accepting or following it up again', async t => {
  const f = fixture(t)
  await f.dispatch()
  const before = longTaskStatus(f.cwd, f.project, 'main'), recovery = registerRecovery(f)
  const queued = recovery.stored.events.find(event => event.type === 'agent/inbox/spliced')!
  ;(queued.data as any).inserted[0].content = [{ type: 'text', text: 'A conflicting isolated recovered payload' }]
  await f.tick()
  await assert.rejects(() => f.host().status(f.cwd, f.project, 'main'), /内容或来源冲突/)
  await f.tick()
  assert.equal(f.followups, 1); assert.deepEqual(recovery.creates, [])
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').attempt!.messageId, before.attempt!.messageId)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.attempts.length, 1)
  assert.ok(f.warnings.some(message => /恢复等待核对/.test(message)))
})

test('Codex active and pending ownership and a paused shared task each prevent parallel DSH continuation', async t => {
  for (const reason of ['active', 'pending', 'task-paused'] as const) {
    const f = fixture(t), native = { active: false, pending: false }, control = { paused: false }
    f.services.set('nativeTaskExecutor', { status: () => native })
    f.services.get('taskGuide').read = () => ({ sessionId: 'main', brief: {}, directives: [], control })
    await f.dispatch(); f.consume(); f.model(); f.finish()
    const before = longTaskStatus(f.cwd, f.project, 'main')
    if (reason === 'task-paused') control.paused = true
    else native[reason] = true
    await f.tick()
    const paused = longTaskStatus(f.cwd, f.project, 'main')
    assert.equal(f.followups, 1); assert.equal(paused.run!.paused, true)
    assert.equal(paused.attempt!.id, before.attempt!.id)
    assert.match(paused.run!.pauseReason!, reason === 'task-paused' ? /共同任务/ : /Codex/)
    const decision = await f.listeners.get('agent/pre-step')!({ agent: f.root, turn: 2, messages: [{ id: before.attempt!.messageId }] }, () => ({ kind: 'enter' }))
    assert.equal(decision.kind, 'reject')
  }
})

test('Codex ownership or a shared-task pause also blocks activation of an unloaded registered root', async t => {
  for (const reason of ['active', 'pending', 'task-paused'] as const) {
    const f = fixture(t)
    await f.dispatch(); f.consume(); f.model(); f.finish()
    const recovery = registerRecovery(f)
    if (reason === 'task-paused') f.services.get('taskGuide').read = () => ({ control: { paused: true } })
    else f.services.set('nativeTaskExecutor', { status: () => ({ [reason]: true }) })
    await f.tick()
    assert.deepEqual(recovery.loads, []); assert.deepEqual(recovery.creates, [])
    assert.equal(f.followups, 1); assert.equal(f.agents.has('main'), false)
  }
})

test('overlapping timer ticks share one original-root recovery transaction', async t => {
  const f = fixture(t)
  await f.dispatch(); f.consume(); f.model(); f.finish()
  const recovery = registerRecovery(f), resolve = f.services.get('sessionController').resolveAgent
  const entered: string[] = [], release = Promise.withResolvers<void>()
  f.services.get('sessionController').resolveAgent = async (id: string) => { entered.push(id); await release.promise; return resolve(id) }
  const first = f.tick()
  await waitForHost(() => entered.length === 1)
  await f.tick(); await f.tick()
  assert.deepEqual(entered, ['main']); assert.equal(f.followups, 1)
  release.resolve(); await first; await waitForHost(() => f.followups === 2)
  assert.deepEqual(recovery.loads, ['main']); assert.deepEqual(recovery.creates, [])
})

test('a registry failure is contained and a later healthy timer tick can still continue the original task', async t => {
  const f = fixture(t)
  await f.dispatch(); f.consume(); f.model(); f.finish()
  const recovery = registerRecovery(f, false), list = recovery.registry.list
  recovery.registry.list = () => { throw new Error('Isolated registry read failure') }
  await f.tick()
  assert.equal(f.followups, 1)
  assert.ok(f.warnings.some(message => /登记工作区.*暂不可用/.test(message)))
  recovery.registry.list = list
  await f.tick(); await waitForHost(() => f.followups === 2)
  assert.deepEqual(recovery.creates, []); assert.deepEqual(recovery.loads, [])
})
