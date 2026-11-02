import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { Session, SESSION_FORMAT_VERSION } from '../../../vendor/deepseek-harness/packages/core/session/src/index.ts'
import { createUserMessage } from '../../../vendor/deepseek-harness/packages/llm/llm/src/message.ts'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { emptyTask } from '../../../packages/professional-tasks/task.ts'
import { bindProjectSession, dispatchFingerprint, loadBoard, saveBoard } from '../src/orchestration.ts'
import { officialStageDir } from '../src/outputs.ts'
import { longTaskStatus, markLongTaskDispatchIntent, markLongTaskDispatched, startLongTask } from '../src/long-task-runtime.ts'
import { registerLongTaskHost } from '../src/long-task-host.ts'
import { retainKnowledgeVersion } from '../src/knowledge-versions.ts'
import { distillTemplateDna } from '../src/template-dna.ts'

const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const json = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2)) }

/** Real project/Session events with only provider, UI and persistence boundaries faked. */
function fixture(t: any) {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-long-context-')), home = join(cwd, 'isolated-home'), kb = join(home, 'knowledge-base')
  mkdirSync(kb, { recursive: true })
  const env = { DSH_HOME: home, AGENT_PI_KB_ROOT: kb, AGENT_PI_MODULES_ROOT: join(home, 'modules'), AGENT_PI_SKILLS_ROOT: join(home, 'skills') }
  const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }; assert.equal(dirname(resolve(cwd)), resolve(tmpdir())); assert.match(cwd, /ap-long-context-/); rmSync(cwd, { recursive: true, force: true }) })
  const source = join(cwd, 'source.txt'); writeFileSync(source, 'Existing source facts\n')
  const skill = join(cwd, 'catalog', 'actual-method.md'); mkdirSync(dirname(skill)); writeFileSync(skill, '# Actual native method\n')
  const project = createBusinessProject({ workspaceRootPath: cwd, module: 'delivery', projectId: 'context', name: 'Context', rootPath: cwd, createDirectory: false, inputPaths: [source], workflowId: 'delivery-main', workflowSnapshot: { id: 'delivery-main', module: 'delivery', label: 'Context', labelZh: '接力版本验收', stages: [{ id: 'first', label: 'First', labelZh: '当前阶段', prompt: 'Only current stage', skillSlugs: ['method-skill'], consumes: [] }] } })
  bindProjectSession(cwd, project, 'main', 'first')
  const output = join(officialStageDir(cwd, project.projectId, 'first'), 'one.md'); mkdirSync(dirname(output), { recursive: true })
  saveBoard(cwd, { schemaVersion: 2, projectId: project.projectId, module: project.module, currentStageId: 'first', stages: { first: { stageId: 'first', status: 'idle', tasks: [{ id: 'one', title: 'Actual output', status: 'queued', markdownPath: output }], updatedAt: new Date().toISOString() } }, updatedAt: new Date().toISOString() })
  const task = emptyTask('main')
  task.brief.objective = '编写当前报告'; task.briefProvenance.objective = { origin: 'user', status: 'explicit', messageId: 'human', updatedRevision: 1 }
  const sessions = new Map<string, Session>(), agents = new Map<string, any>(), listeners = new Map<string, Function>(), services = new Map<string, any>()
  let followups = 0
  t.mock.method(globalThis, 'setInterval', () => ({ unref() {} }) as any)
  t.mock.method(globalThis, 'clearInterval', () => {})
  const append = (row: Session, type: any, data: any) => { const event = row.append(type, data, ...(['user/message', 'assistant/message', 'tool/result'].includes(type) ? [{ surfaceOp: 'append' as const }] : [])); listeners.get('session/event')?.(row, event); return event }
  const agent = (id: string, parentSession?: string) => {
    const session = Session.create(id as any, undefined, { version: SESSION_FORMAT_VERSION, id: id as any, createdAt: Date.now(), cwd, isSeeded: false, ...(parentSession ? { parentSession: parentSession as any, origin: 'subagent' as const } : {}) })
    sessions.set(id, session)
    const row: any = { id, session, status: 'idle', inbox: { hasPending: false }, followup(message: any) { followups++; row.inbox.hasPending = true; append(session, 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }) } }
    agents.set(id, row); listeners.get('agent/created')?.({ agent: row }); return row
  }
  const root = agent('main')
  const catalog = { complete: true, skills: [{ name: 'method-skill', path: skill as string | undefined, invocation: { modelInvocable: true }, source: 'custom', provider: 'fixture' }] }
  const policy = { mode: 'workspace-write', workspaceRoot: cwd }
  let tools = ['read', 'write']
  services.set('agents', { get: (id: string) => agents.get(id), list: () => [...agents.values()] })
  services.set('sessions', { get: (id: string) => sessions.get(id), flush: async () => true })
  services.set('sessionQuery', { readSession: async (id: string) => { const row = sessions.get(id)!; return { session: row.header, inheritedEventCount: row.inheritedEventCount, events: Array.from({ length: row.seq }, (_, seq) => row.eventAt(seq as any)) } } })
  services.set('taskGuide', { read: () => structuredClone(task), registerControlPrompt() {}, syncWorkbenchProject() {} })
  services.set('skills', { snapshot: async (options: any) => { assert.equal(options.cwd, cwd); assert.equal(options.scope, root); return structuredClone(catalog) } })
  services.set('sandboxPolicy', { resolve: ({ session }: any) => { assert.equal(session, root.session); return structuredClone(policy) } })
  services.set('approval', { overrideOf: () => 'ask' })
  services.set('tools', { schemas: (scope: any) => { assert.equal(scope, root); return tools.map(name => ({ name })) } })
  const ctx = { get: (name: string) => services.get(name), provide: (name: string, value: any) => services.set(name, value), on: (event: string, fn: Function) => listeners.set(event, fn), emit() {}, logger: { warn() {} }, effect(fn: Function) { const dispose = fn(); t.after(dispose) } }
  const host = registerLongTaskHost(ctx, createUserMessage)
  const key = dispatchFingerprint(loadBoard(cwd, project.projectId, project.module).stages.first!)
  const offer = () => host.offer(cwd, project, 'main', { draft: 'Only the current stage output', dispatch: { stageId: 'first', key } })
  const dispatch = () => host.dispatch(cwd, project, { sessionId: 'main', stageId: 'first', key })
  const consume = () => {
    const message = longTaskStatus(cwd, project, 'main').attempt!.messageId!
    append(root.session, 'turn/start', { turn: 1 }); root.status = 'running'
    listeners.get('agent/inbox/claimed')!({ agent: root, message: { id: message }, turn: 1 })
    const event: any = root.session.eventAt(0 as any)!.data
    append(root.session, 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
    append(root.session, 'user/message', event.inserted[0]); root.inbox.hasPending = false
  }
  const nextStep = () => listeners.get('agent/pre-step')!({ agent: root, turn: 1, messages: [] }, () => ({ kind: 'enter' }))
  const status = () => longTaskStatus(cwd, project, 'main')
  return { cwd, kb, project, output, skill, task, root, catalog, policy, host, key, agent, append, offer, dispatch, consume, nextStep, status, setTools(value: string[]) { tools = value }, get followups() { return followups } }
}
function selectKnowledge(f: ReturnType<typeof fixture>, text = '# 规范\n\n真实测试条款。\n', slug = 'selected-source') {
  const path = join(f.kb, 'files', slug + '.md'); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text)
  const entry: any = { slug, name: 'Selected source', category: '用户模板', sourcePath: path, managedPath: path, sourceHash: sha(text), sizeBytes: Buffer.byteLength(text), chunkCount: 1, parseStatus: 'ready', createdAt: 'first', updatedAt: 'first' }
  const manifest: any = { schemaVersion: 1, slug, name: entry.name, category: entry.category, sourcePath: path, indexedAt: 'first', chunks: [{ id: 'body', title: '正文', startLine: 1, endLine: 3, startOffset: 0, endOffset: text.length, metadata: { headingPath: [], clauseRefs: [], tableRefs: [], boqRefs: [] } }] }
  entry.versionId = retainKnowledgeVersion(f.kb, entry, manifest)!
  json(join(f.kb, 'registry.json'), { schemaVersion: 1, entries: [entry] }); json(join(f.kb, 'index', slug + '.json'), manifest)
  json(join(f.kb, 'task-selection.json'), { schemaVersion: 1, bySession: { main: [slug] } })
  return entry
}
function bindDna(f: ReturnType<typeof fixture>, entry: any, extra = false) {
  const profile = distillTemplateDna(f.kb, { slug: entry.slug, versionId: entry.versionId, ...(extra ? { analysis: { layers: [{ id: 'L3', observations: [{ text: '限定已给资料', sourceQuote: '真实测试条款。' }], unknowns: [] }] } } : {}) })
  json(join(f.kb, 'template-task-bindings', sha('main') + '.json'), { schemaVersion: 1, sessionId: 'main', bindings: [{ slug: entry.slug, versionId: entry.versionId, dnaId: profile.dnaId }] })
}

test('host dispatch and native next-step accept progress churn but stop on a new user execution constraint', async t => {
  const f = fixture(t); f.offer(); await f.dispatch(); f.consume()
  f.task.revision++; f.task.updatedAt = 'later'; f.task.findings.push({ id: 'new', title: 'Useful finding' } as any)
  assert.equal((await f.nextStep()).kind, 'enter')
  assert.equal(f.status().run!.paused, false)
  f.task.directives.push({ id: 'new-constraint', key: 'scope', kind: 'constraint', text: '只生成指定章节', source: 'user', status: 'active', messageId: 'human-2', updatedRevision: 2 })
  assert.equal((await f.nextStep()).kind, 'reject')
  assert.equal(f.status().run!.paused, true)
  assert.equal(f.followups, 1)
})

test('changing selected knowledge invalidates a prepared native preview before any dispatch', async t => {
  const f = fixture(t); selectKnowledge(f); f.offer()
  await f.host.prepared(f.cwd, f.project, 'main', { stageId: 'first', key: f.key })
  json(join(f.kb, 'task-selection.json'), { schemaVersion: 1, bySession: {} })
  await assert.rejects(() => f.dispatch(), /预览已过期|已变化/)
  assert.equal(f.followups, 0)
})

test('a valid new primary template DNA halts the next native step without discarding the original session', async t => {
  const f = fixture(t), entry = selectKnowledge(f); bindDna(f, entry); f.offer(); await f.dispatch(); f.consume()
  const old = f.status().attempt!.context!.templates[0]!.dnaId
  bindDna(f, entry, true)
  assert.equal((await f.nextStep()).kind, 'reject')
  assert.equal(f.status().attempt!.context!.templates[0]!.dnaId, old)
  assert.equal(f.status().run!.sessionId, 'main'); assert.equal(f.followups, 1)
})

test('a changed skill file makes a late actual child artifact stale rather than accepted', async t => {
  const f = fixture(t); f.offer(); await f.dispatch(); f.consume()
  const child = f.agent('child', 'main')
  f.host.registerAssignments(f.cwd, f.project, 'main', [{ childSessionId: child.id, expectedOutput: f.output }])
  f.append(child.session, 'turn/start', { turn: 1 })
  writeFileSync(f.skill, '# New instruction version\n'); writeFileSync(f.output, '# Actual late child draft\n')
  f.append(child.session, 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.equal(f.status().run!.submissions.length, 1)
  assert.equal(f.status().run!.submissions[0]!.status, 'stale')
  assert.equal((await f.nextStep()).kind, 'reject')
})

test('scoped tool permissions and sandbox changes independently invalidate native continuation', async t => {
  const f = fixture(t); f.offer(); await f.dispatch(); f.consume()
  f.setTools(['read'])
  assert.equal((await f.nextStep()).kind, 'reject')
  assert.match(f.status().reason, /权限|约束/)
  f.host.pause(f.cwd, f.project, 'main', false)
  f.setTools(['read', 'write']); f.policy.mode = 'read-only'
  assert.equal((await f.nextStep()).kind, 'reject')
  assert.equal(f.followups, 1)
})

test('native catalog completeness, virtual skills and invocation controls are required before dispatch', async t => {
  const f = fixture(t)
  f.catalog.complete = false; f.offer()
  await assert.rejects(() => f.dispatch(), /完整就绪/)
  f.catalog.complete = true; f.catalog.skills[0]!.path = undefined; f.offer()
  await assert.rejects(() => f.dispatch(), /技能不可用/)
  f.catalog.skills[0]!.path = f.skill; f.catalog.skills[0]!.invocation.modelInvocable = false; f.offer()
  await assert.rejects(() => f.dispatch(), /技能不可用/)
  assert.equal(f.followups, 0)
})

test('a new winning same-name native skill invalidates the current attempt even when old file bytes did not change', async t => {
  const f = fixture(t); f.offer(); await f.dispatch(); f.consume()
  const replacement = join(f.cwd, 'project-method.md'); writeFileSync(replacement, '# Project override')
  f.catalog.skills[0]!.path = replacement
  assert.equal((await f.nextStep()).kind, 'reject')
  assert.equal(f.status().attempt!.context!.skills[0]!.sourcePath, resolve(f.skill))
  assert.equal(f.followups, 1)
})

test('an unsubmitted legacy preview gains a fresh snapshot only on explicit dispatch and keeps its attempt identity', async t => {
  const f = fixture(t)
  const old = startLongTask(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key, draft: 'Only the current stage output' })
  assert.equal((await f.host.status(f.cwd, f.project, 'main')).phase, 'needs_review')
  assert.equal(f.status().attempt!.context, undefined)
  f.offer(); const current = await f.dispatch()
  assert.equal(current.attempt!.id, old.attempt!.id)
  assert.equal(current.attempt!.context!.rootSessionId, 'main')
  assert.equal(current.run!.attempts.length, 1); assert.equal(f.followups, 1)
})

test('a sent legacy attempt without a real settlement cannot be replaced after context invalidation', async t => {
  const f = fixture(t)
  const old = startLongTask(f.cwd, f.project, { sessionId: 'main', stageId: 'first', key: f.key, draft: 'Only the current stage output' })
  const message = createUserMessage({ content: [{ type: 'text', text: old.attempt!.draft }], source: { kind: 'plugin:tender-host', form: 'instructions' } })
  markLongTaskDispatchIntent(f.cwd, f.project, { sessionId: 'main', attemptId: old.attempt!.id, key: f.key, messageId: message.id })
  f.root.followup(message)
  markLongTaskDispatched(f.cwd, f.project, { sessionId: 'main', attemptId: old.attempt!.id, key: f.key, messageId: message.id })
  f.consume(); f.root.status = 'idle' // Crash recovery has no committed turn/end receipt.
  assert.equal((await f.host.status(f.cwd, f.project, 'main')).phase, 'needs_review')
  f.offer()
  await assert.rejects(() => f.dispatch(), /结算|核对/)
  assert.equal(f.status().run!.attempts.length, 1)
  assert.equal(f.status().attempt!.id, old.attempt!.id)
  assert.equal(f.followups, 1)
})
