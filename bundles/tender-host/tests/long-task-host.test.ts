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
import { longTaskStatus } from '../src/long-task-runtime.ts'
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
  t.mock.method(globalThis, 'setInterval', (fn: Function) => { timer = fn; return { unref() {} } as any })
  t.mock.method(globalThis, 'clearInterval', () => {})
  const session = (id: string, parentSession?: string) => {
    const row = Session.create(id as any, undefined, { version: SESSION_FORMAT_VERSION, id: id as any, createdAt: Date.now(), cwd, isSeeded: false, ...(parentSession ? { parentSession: parentSession as any } : {}) })
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
  const ctx = { get: (name: string) => services.get(name), provide: (name: string, value: any) => services.set(name, value), on: (event: string, fn: Function) => listeners.set(event, fn), emit() {}, logger: { warn() {} }, effect(fn: Function) { const dispose = fn(); t.after(dispose) } }
  let host = registerLongTaskHost(ctx, createUserMessage)
  const key = dispatchFingerprint(loadBoard(cwd, project.projectId).stages.first!)
  const offer = () => host.offer(cwd, project, 'main', { draft: 'Only the current stage output', dispatch: { stageId: 'first', key } })
  const dispatch = async (limits = {}) => { offer(); return host.dispatch(cwd, project, { sessionId: 'main', stageId: 'first', key, limits }) }
  const consume = (row = root, turn = 1) => {
    const message = longTaskStatus(cwd, project, 'main').attempt!.messageId!
    append(row.session, 'turn/start', { turn }); row.status = 'running'
    listeners.get('agent/inbox/claimed')!({ agent: row, message: { id: message }, turn })
    append(row.session, 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
    const native = row.session.eventAt(0 as any)!.data as any
    append(row.session, 'user/message', native.inserted[0]); row.inbox.hasPending = false
  }
  const finish = (row = root, turn = 1, kind = 'completed') => { append(row.session, 'turn/end', { turn, reason: { kind } }); row.status = 'idle' }
  const model = (row = root, turn = 1, step = 1, attempt = false) => {
    append(row.session, 'step/start', { turn, step })
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    const stream = [{ type: 'chunk', time: Date.now(), chunk: { type: 'usage', usage } }]
    append(row.session, attempt ? 'assistant/attempt' : 'assistant/message', { turn, step, stream, ...(attempt ? {} : { message: createAssistantMessage({ content: [{ type: 'text', text: 'Actual fixture response' }], source: { provider: 'fixture', model: 'fixture' } }), usage }) })
  }
  return { cwd, project, source, path, key, sessions, agents, root, append, agent, listeners, services, offer, dispatch, consume, finish, model, host: () => host, restart() { host = registerLongTaskHost(ctx, createUserMessage) }, flush(value: boolean) { flushResult = value }, get followups() { return followups }, async tick() { timer(); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)) } }
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
})
