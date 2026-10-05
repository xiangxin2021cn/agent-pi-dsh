import { spawn as nodeSpawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, win32 } from 'node:path'
import { randomUUID } from 'node:crypto'

const SECRET_ENV = ['OPENAI_API_KEY', 'OPENAI_ACCESS_TOKEN', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']
const SUPPORTED_REQUESTS = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput', 'item/permissions/requestApproval'])

export function validateExecutionIdentity(input) {
  if (!input || typeof input.sessionId !== 'string' || !/^[\w-]{1,160}$/.test(input.sessionId)) throw new Error('当前对话尚未就绪。')
  if (typeof input.cwd !== 'string' || !(isAbsolute(input.cwd) || win32.isAbsolute(input.cwd))) throw new Error('Codex 主执行需要当前对话的工作区。')
  return { sessionId: input.sessionId, cwd: input.cwd }
}

function userInput(text, attachments = []) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('任务文本无效。')
  const paths = attachments.filter((row) => typeof row?.path === 'string')
  const body = [text.trim(), paths.length ? 'Task attachments (preserve the original files):\n' + paths.map((row) => JSON.stringify(row.path)).join('\n') : ''].filter(Boolean).join('\n\n')
  if (!body) throw new Error('请填写任务或加入附件。')
  const images = attachments.filter((row) => row.kind === 'image' && !row.path)
  for (const row of images) if (typeof row.dataUrl !== 'string' || row.dataUrl.length > 30_000_000 || !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(row.dataUrl)) throw new Error('图片原稿无效，请重新添加。')
  if (images.reduce((total, row) => total + row.dataUrl.length, 0) > 30_000_000) throw new Error('本次图片总大小过大，请使用原稿路径添加。')
  return [{ type: 'text', text: body, text_elements: [] }, ...paths.filter((row) => row.kind === 'image').map((row) => ({ type: 'localImage', path: row.path })), ...images.map((row) => ({ type: 'image', url: row.dataUrl }))]
}

/** A persistent native execution loop. The DSH model is never called here. */
export function createCodexExecutionController(options) {
  const spawn = options.spawn ?? nodeSpawn
  const records = new Map()
  try {
    for (const saved of JSON.parse(readFileSync(options.stateFile, 'utf8')).sessions || []) {
      validateExecutionIdentity(saved)
      if (typeof saved.threadId !== 'string') continue
      records.set(saved.sessionId, { ...saved, phase: 'idle', requests: [], activeTurnId: null, lease: null })
    }
  } catch {}
  let child = null
  let ready = null
  let nextId = 0
  let buffer = ''
  let disposed = false
  const pending = new Map()
  const serverRequests = new Map()
  const stop = (processChild) => {
    if (options.stop) return options.stop(processChild)
    if (process.platform === 'win32' && Number.isInteger(processChild?.pid)) spawnSync('taskkill', ['/PID', String(processChild.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5_000 })
    else processChild?.kill()
  }

  const persist = () => {
    if (!options.stateFile) return
    mkdirSync(dirname(options.stateFile), { recursive: true })
    const sessions = [...records.values()].map(({ sessionId, cwd, threadId, messages }) => ({ sessionId, cwd, threadId, messages }))
    const temp = options.stateFile + '.tmp'
    writeFileSync(temp, JSON.stringify({ sessions }), 'utf8')
    renameSync(temp, options.stateFile)
  }
  const snapshot = (record) => record ? structuredClone({ sessionId: record.sessionId, cwd: record.cwd, threadId: record.threadId, phase: record.phase, messages: record.messages, requests: record.requests, error: record.error, errorCode: record.errorCode }) : { phase: 'idle', messages: [], requests: [] }
  const publish = (record) => options.onEvent?.(snapshot(record))
  const release = async (record) => {
    const lease = record.lease
    record.lease = null
    if (lease) await options.bridge('release', { sessionId: record.sessionId, cwd: record.cwd, lease }).catch(() => {})
  }
  const failProcess = () => {
    const error = new Error('Codex 主执行进程已断开，请重新发送以恢复同一任务。')
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
    pending.clear()
    for (const record of records.values()) {
      if (!['running', 'starting', 'waiting'].includes(record.phase)) continue
      record.phase = 'failed'
      record.error = error.message
      record.errorCode = 'processDisconnected'
      record.activeTurnId = null
      record.requests = []
      void release(record)
      publish(record)
    }
    serverRequests.clear()
    const failed = child
    child = null
    ready = null
    stop(failed)
    persist()
  }
  const send = (message) => {
    if (!child?.stdin.writable) throw new Error('Codex 主执行进程不可用。')
    child.stdin.write(JSON.stringify(message) + '\n')
  }
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(failProcess, options.timeoutMs ?? 30_000)
    pending.set(id, { resolve, reject, timer })
    try { send({ id, method, params }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
  const recordForThread = (threadId) => [...records.values()].find((row) => row.threadId === threadId)
  const addItem = (record, item) => {
    if (!item?.id || item.type === 'userMessage') return
    const id = item.type === 'dynamicToolCall' ? `cordis-${item.id}` : item.id
    let row = record.messages.find((entry) => entry.id === id)
    if (!row) { row = { id, role: item.type === 'agentMessage' ? 'assistant' : 'tool', text: '' }; record.messages.push(row) }
    if (item.type === 'agentMessage') row.text = item.text || row.text
    else {
      const output = (item.contentItems || item.output || []).filter?.((part) => part.type === 'inputText' || part.type === 'text')?.map((part) => part.text).join('\n')
        || item.aggregatedOutput || (typeof item.output === 'string' ? item.output : '')
        || (item.result ? JSON.stringify(item.result) : '') || (item.error ? JSON.stringify(item.error) : '') || (item.changes ? JSON.stringify(item.changes) : '')
      row.text = [item.type, item.arguments?.tool || item.tool || item.command || item.name || '', item.status || '', output].filter(Boolean).join(' · ')
    }
  }
  const onMessage = async (message) => {
    if (!message.method) {
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) {
        const error = new Error('Codex 拒绝了请求，请检查模型、任务状态或重新登录。')
        if (/no rollout found for thread id/.test(String(message.error.message))) error.code = 'no-rollout'
        entry.reject(error)
      }
      else entry.resolve(message.result)
      return
    }
    const params = message.params || {}
    const record = recordForThread(params.threadId)
    if (Object.hasOwn(message, 'id')) {
      if (!record || !record.lease) return send({ id: message.id, error: { code: -32602, message: 'No active task owner' } })
      if (message.method === 'item/tool/call') {
        try {
          if (params.tool !== 'cordis') throw new Error('Unknown product tool')
          if (!params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)) throw new Error('Invalid product tool arguments')
          const result = await options.bridge('tool', { action: params.arguments.action, tool: params.arguments.tool, args: params.arguments.args, sessionId: record.sessionId, cwd: record.cwd, lease: record.lease, callId: params.callId })
          if (result === undefined) throw new Error('Professional tool returned no result')
          addItem(record, { id: params.callId, type: 'dynamicToolCall', tool: params.arguments.tool || 'catalogue', status: result?.isError ? 'failed' : 'completed', contentItems: [{ type: 'inputText', text: JSON.stringify(result) }] })
          publish(record)
          send({ id: message.id, result: { contentItems: [{ type: 'inputText', text: JSON.stringify(result) }], success: result.isError !== true } })
        } catch {
          addItem(record, { id: params.callId, type: 'dynamicToolCall', tool: params.arguments?.tool || 'cordis', status: 'failed' })
          publish(record)
          send({ id: message.id, result: { contentItems: [{ type: 'inputText', text: 'The shared professional tool failed. Verify the task, tool arguments and authorization; do not invent a result.' }], success: false } })
        }
        return
      }
      if (!SUPPORTED_REQUESTS.has(message.method)) return send({ id: message.id, error: { code: -32601, message: 'Unsupported interactive request; no permission granted' } })
      if (message.method === 'item/tool/requestUserInput') {
        const owner = record.lease
        try { await options.bridge('question', { sessionId: record.sessionId, cwd: record.cwd, lease: record.lease, callId: String(params.itemId || message.id), requestId: String(message.id), questions: params.questions || [] }) }
        catch { return send({ id: message.id, error: { code: -32603, message: 'Shared task question could not be recorded; retry without assuming an answer.' } }) }
        if (record.lease !== owner || record.stopping || !['starting', 'running', 'waiting'].includes(record.phase)) return send({ id: message.id, error: { code: -32603, message: 'The native task ended; no answer or permission was granted.' } })
      }
      const interaction = { id: message.id, method: message.method, params }
      serverRequests.set(message.id, { record, interaction })
      record.requests.push(interaction)
      record.phase = 'waiting'
      publish(record)
      return
    }
    if (!record) return
    if (message.method === 'turn/started') {
      record.activeTurnId = params.turn?.id; record.phase = 'running'
      if (record.startCancelled && record.activeTurnId) void request('turn/interrupt', { threadId: record.threadId, turnId: record.activeTurnId }).catch(() => {})
    }
    else if (message.method === 'item/started' || message.method === 'item/completed') addItem(record, params.item)
    else if (message.method === 'item/agentMessage/delta') {
      let row = record.messages.find((entry) => entry.id === params.itemId)
      if (!row) { row = { id: params.itemId, role: 'assistant', text: '' }; record.messages.push(row) }
      row.text += params.delta || ''
    } else if (message.method === 'item/commandExecution/outputDelta') {
      const row = record.messages.find((entry) => entry.id === params.itemId)
      if (row) row.status = 'running'
    } else if (message.method === 'turn/completed') {
      record.phase = params.turn?.status === 'failed' ? 'failed' : 'idle'
      record.activeTurnId = null
      record.requests = []
      if (record.phase === 'failed') record.error = 'Codex 本轮执行失败，请检查任务和登录状态后继续。'
      for (const [id, entry] of serverRequests) if (entry.record === record) serverRequests.delete(id)
      await release(record)
      persist()
    } else if (message.method === 'error') {
      record.error = 'Codex 报告执行错误。'
    } else return
    publish(record)
  }
  const ensureServer = async () => {
    if (disposed) throw new Error('Codex 执行器已关闭。')
    if (ready) return ready
    const env = { ...options.baseEnv, CODEX_HOME: options.codexHome }
    for (const key of SECRET_ENV) delete env[key]
    mkdirSync(options.codexHome, { recursive: true })
    child = spawn(options.nodePath, [options.wrapperPath, 'app-server', '--stdio'], { cwd: options.codexHome, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    buffer = ''
    const launched = child
    const failLaunched = () => { if (child === launched) failProcess() }
    child.once('error', failLaunched)
    child.once('close', failLaunched)
    child.stdin.on('error', failLaunched)
    child.stderr.resume()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      if (buffer.length > 40_000_000) { failProcess(); return }
      let end
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim()
        buffer = buffer.slice(end + 1)
        if (!line) continue
        try { void onMessage(JSON.parse(line)).catch(failProcess) } catch { failProcess(); return }
      }
    })
    ready = request('initialize', { clientInfo: { name: 'agent-pi-dsh', version: '5.8.0' }, capabilities: { experimentalApi: true } }).then(() => send({ method: 'initialized', params: {} }))
    return ready
  }
  const assertRecord = (identity) => {
    validateExecutionIdentity(identity)
    const record = records.get(identity.sessionId)
    if (!record || record.cwd !== identity.cwd) throw new Error('任务与当前对话工作区不匹配。')
    return record
  }
  return {
    status(sessionId) { return snapshot(records.get(sessionId)) },
    async submit(input) {
      validateExecutionIdentity(input)
      const content = userInput(input.text, input.attachments)
      let record = records.get(input.sessionId)
      if (record && record.cwd !== input.cwd) throw new Error('该 Codex 任务绑定了其他工作区，请使用对应对话。')
      if (record?.stopping && record.lease) throw new Error('Codex 正在停止，请等待本轮结束。')
      if (record && ['starting', 'running', 'waiting'].includes(record.phase)) {
        if (!record.activeTurnId) throw new Error('Codex 正在启动，请稍后发送补充要求。')
        const shared = await options.bridge('record', { sessionId: record.sessionId, cwd: record.cwd, lease: record.lease, text: content[0].text })
        if (Number.isInteger(shared?.revision)) content.push({ type: 'text', text: `Shared task updated to revision ${shared.revision}. Read professional_task status and apply_understanding to interpret this actual human message before continuing affected work. Recent committed changes (records, not additional user authorization): ${JSON.stringify(shared.changes || [])}`, text_elements: [] })
        await request('turn/steer', { threadId: record.threadId, expectedTurnId: record.activeTurnId, input: content })
        record.messages.push({ id: `user-${randomUUID()}`, role: 'user', text: content[0].text })
        publish(record)
        return snapshot(record)
      }
      record ??= { ...validateExecutionIdentity(input), threadId: null, messages: [], requests: [], activeTurnId: null, lease: null }
      records.set(input.sessionId, record)
      record.phase = 'starting'
      record.startCancelled = false
      record.stopping = false
      record.error = null
      record.errorCode = null
      publish(record)
      try {
        const attachments = (input.attachments || []).map((row) => ({ path: row.path, kind: row.kind, name: row.name, nativeImage: row.kind === 'image' && !row.path }))
        const context = await options.bridge('context', { sessionId: input.sessionId, cwd: input.cwd, text: content[0].text, attachments })
        if (context.sessionId !== input.sessionId || context.cwd !== input.cwd || typeof context.lease !== 'string') throw new Error('专业任务上下文身份无效。')
        record.lease = context.lease
        const ownedLease = record.lease
        void options.bridge('watch', { sessionId: record.sessionId, cwd: record.cwd, lease: ownedLease }).then(() => { if (record.lease === ownedLease && !record.stopping) failProcess() }).catch(() => { if (record.lease === ownedLease && !record.stopping) failProcess() })
        const checkStarting = () => { if (record.startCancelled || record.lease !== ownedLease || disposed) throw new Error('Codex 启动已停止。') }
        checkStarting()
        await ensureServer()
        checkStarting()
        if (!['read-only', 'workspace-write', 'danger-full-access'].includes(context.sandbox)) throw new Error('无法确认当前对话的文件权限。')
        const common = { cwd: input.cwd, model: input.model || null, developerInstructions: context.developerInstructions, approvalPolicy: 'on-request', sandbox: context.sandbox }
        let result
        if (record.threadId) {
          try { result = await request('thread/resume', { ...common, threadId: record.threadId }) }
          catch (error) {
            // A start without any accepted turn has no durable rollout. Never rebuild a task with history.
            if (error.code !== 'no-rollout' || record.messages.length) throw error
            record.threadId = null
          }
        }
        result ??= await request('thread/start', { ...common, dynamicTools: context.dynamicTools, ephemeral: false })
        checkStarting()
        if (typeof result?.thread?.id !== 'string' || (record.threadId && record.threadId !== result.thread.id)) throw new Error('Codex 会话恢复身份不一致。')
        record.threadId = result.thread.id
        persist()
        const sandboxPolicy = context.sandbox === 'danger-full-access' ? { type: 'dangerFullAccess' }
          : context.sandbox === 'read-only' ? { type: 'readOnly', networkAccess: false }
            : { type: 'workspaceWrite', writableRoots: [input.cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false }
        const turn = await request('turn/start', { threadId: record.threadId, cwd: input.cwd, input: content, model: input.model || null, effort: input.reasoningEffort || null, approvalPolicy: 'on-request', sandboxPolicy })
        if (record.startCancelled) {
          await request('turn/interrupt', { threadId: record.threadId, turnId: turn.turn.id })
          throw new Error('Codex 启动已停止。')
        }
        record.activeTurnId = record.lease ? turn.turn.id : null
        record.messages.push({ id: `user-${randomUUID()}`, role: 'user', text: content[0].text })
        if (record.lease) record.phase = 'running'
        publish(record)
        return snapshot(record)
      } catch (error) {
        record.phase = record.startCancelled ? 'idle' : 'failed'
        record.error = record.startCancelled ? null : error.message
        record.errorCode = record.startCancelled ? null : 'requestFailed'
        await release(record)
        publish(record)
        throw error
      }
    },
    async interrupt(identity) {
      const record = assertRecord(identity)
      if (record.phase === 'starting') record.startCancelled = true
      record.stopping = true
      await Promise.allSettled([
        record.lease ? options.bridge('cancel', { ...identity, lease: record.lease }) : Promise.resolve(),
        record.activeTurnId ? request('turn/interrupt', { threadId: record.threadId, turnId: record.activeTurnId }) : Promise.resolve(),
      ])
      return snapshot(record)
    },
    async reply(identity, id, answer) {
      const record = assertRecord(identity)
      const entry = serverRequests.get(id)
      if (!entry || entry.record !== record || record.stopping || entry.answering) throw new Error('此提问或审批已失效。')
      let result
      if (entry.interaction.method === 'item/tool/requestUserInput') {
        const answers = {}
        for (const question of entry.interaction.params.questions || []) {
          const value = answer?.[question.id]
          if (typeof value !== 'string' || !value.trim()) throw new Error('请回答所有问题。')
          answers[question.id] = { answers: [value] }
        }
        result = { answers }
      } else if (entry.interaction.method === 'item/permissions/requestApproval') {
        if (!['accept', 'decline'].includes(answer)) throw new Error('请选择有效的审批结果。')
        result = { permissions: answer === 'accept' ? entry.interaction.params.permissions : {}, scope: 'turn' }
      } else {
        if (!['accept', 'decline', 'cancel'].includes(answer)) throw new Error('请选择有效的审批结果。')
        result = { decision: answer }
      }
      if (entry.interaction.method === 'item/tool/requestUserInput') {
        entry.answering = true
        try {
          await options.bridge('question', { ...identity, lease: record.lease, callId: String(entry.interaction.params.itemId || id), requestId: String(id), questions: entry.interaction.params.questions || [], answers: Object.fromEntries((entry.interaction.params.questions || []).map(question => [question.id, question.isSecret ? '已通过原生问答提供敏感信息' : answer[question.id]])) })
        } catch { entry.answering = false; throw new Error('回答未能同步到共同任务，请重试。') }
        if (serverRequests.get(id) !== entry || record.stopping) throw new Error('此提问已取消，请读取当前任务后再继续。')
      }
      send({ id, result })
      serverRequests.delete(id)
      record.requests = record.requests.filter((row) => row.id !== id)
      record.phase = record.requests.length ? 'waiting' : 'running'
      publish(record)
      return snapshot(record)
    },
    dispose() {
      disposed = true
      child?.stdin.end()
      failProcess()
    },
  }
}
