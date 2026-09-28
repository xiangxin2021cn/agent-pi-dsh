import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { admitDepthMessages, bindDepthStore, checkDepth, depthCommand, depthContext, depthState, registerProfessionalDepth, updateDepth } from '../src/professional-depth.ts'
import { createDepthStore } from '../src/professional-depth-store.mjs'
import { zipStore } from '../src/xlsx-zip.ts'

function session(id = 'one', inherited: any[] = []) {
  const events: any[] = [...inherited]
  return { id, header: { cwd: '/workspace' }, snapshotEvents: () => events,
    append: (type: string, data: unknown) => events.push({ type, data: structuredClone(data) }) }
}
const brief = { purpose: '现场周例会协调', depth: '执行级分析，列出责任人与依赖', evidence: '仅使用本次上传资料，缺少工期时明确列为缺口', format: 'Markdown 表格', acceptance: '任务负责人、依赖与风险可追踪' }
const user = (text: string) => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
function enabled() {
  const s = session()
  updateDepth(s, { action: 'toggle', enabled: true, revision: 0 }, 'user')
  return s
}
function assess(s: ReturnType<typeof session>, criteria: any[]) {
  return updateDepth(s, { action: 'brief', revision: depthState(s).revision, brief, criteria }, 'agent')
}
function files(entries: Record<string, string | Buffer>, beforeRead?: () => void) {
  return {
    resolve: async (path: string) => path,
    stat: async (path: string) => entries[path] === undefined ? undefined : { type: 'file' },
    readBytes: async (path: string) => { beforeRead?.(); return Buffer.from(entries[path]) },
  }
}

test('ordinary conversations have no prompt, state inheritance or enable permission for models', () => {
  const plain = session()
  admitDepthMessages(plain, [user('制定一份普通计划')])
  assert.equal(plain.snapshotEvents().length, 0)
  assert.equal(depthContext(plain), '')
  assert.throws(() => updateDepth(plain, { action: 'toggle', enabled: true, revision: 0 }, 'agent'), /只能由用户/)
  const parent = enabled()
  assess(parent, [{ id: 'quality', title: '责任分工适用', kind: 'review' }])
  assert.equal(depthState(session('child', parent.snapshotEvents())).enabled, false)
  assert.equal(parent.snapshotEvents().length, 0, 'product preferences never enter canonical session events')
  assert.equal(depthState(session('one', parent.snapshotEvents())).enabled, false)
})

test('only direct explicit user commands change mode; mentions, negation and untrusted content do not', () => {
  assert.equal(depthCommand(user('请启用专业深度。制定进度计划')), true)
  assert.equal(depthCommand(user('关闭专业深度，继续普通聊天')), false)
  assert.equal(depthCommand(user('Enable professional depth. Prepare a schedule')), true)
  assert.equal(depthCommand(user('Turn off professional depth, continue normally')), false)
  for (const text of ['不要启用专业深度', '解释“启用专业深度”是什么意思', '文档说：启用专业深度', '> 启用专业深度', '专业深度的按钮在哪里']) assert.equal(depthCommand(user(text)), undefined)
  assert.equal(depthCommand({ ...user('启用专业深度'), source: { kind: 'plugin' } }), undefined)
  const s = session()
  admitDepthMessages(s, [user('启用专业深度。施工计划')])
  assert.equal(depthState(s).enabled, true)
  admitDepthMessages(s, [user('关闭专业深度。')])
  assert.equal(depthContext(s), '')
})

test('mid-task edits invalidate checks and stale agent proposals cannot overwrite them', async () => {
  const s = enabled()
  const assessment = assess(s, [{ id: 'content', title: '责任人', kind: 'contains', path: 'plan.md', expected: '责任人' }])
  await checkDepth(s, files({ 'plan.md': '责任人：待确认' }), { revision: assessment.revision })
  const edited = updateDepth(s, { action: 'brief', revision: assessment.revision, brief: { ...brief, purpose: '领导决策汇报' }, criteria: assessment.criteria }, 'user')
  assert.deepEqual(edited.checks, [])
  assert.equal(edited.needsAssessment, true)
  assert.throws(() => updateDepth(s, { action: 'brief', revision: assessment.revision, brief, criteria: [] }, 'agent'), /已更新/)
  assert.equal(depthState(s).brief.purpose, '领导决策汇报')
  admitDepthMessages(s, [user('只调整汇报结构，不重算已确认数据')])
  assert.equal(depthState(s).brief.purpose, '领导决策汇报')
  assert.equal(depthState(s).needsAssessment, true)
})

test('actual bytes determine check results; semantic review never masquerades as machine acceptance', async () => {
  const s = enabled()
  const assessment = assess(s, [
    { id: 'missing', title: '交付文件', kind: 'file', path: 'missing.docx' },
    { id: 'wrong', title: '实际格式', kind: 'file', path: 'fake.pdf' },
    { id: 'valid', title: '有效 JSON', kind: 'json', path: 'data.json' },
    { id: 'content', title: '负责人', kind: 'contains', path: 'plan.md', expected: '责任人' },
    { id: 'quality', title: '计划可执行性', kind: 'review' },
  ])
  const result = await checkDepth(s, files({ 'fake.pdf': 'not pdf', 'data.json': '{"ready":true}', 'plan.md': '只有标题' }), { revision: assessment.revision, reviewNotes: '仍缺少工程量与责任人，不能确认执行可行性。' })
  assert.deepEqual(result.checks.map((item) => item.status), ['failed', 'failed', 'passed', 'failed', 'review'])
  assert.match(result.checks[2].sha256!, /^[a-f0-9]{64}$/)
  assert.match(result.reviewNotes, /不能确认/)
})

test('a user edit during inspection discards stale verification', async () => {
  const s = enabled()
  const assessment = assess(s, [{ id: 'file', title: '输出', kind: 'file', path: 'output.md' }])
  const fs = files({ 'output.md': 'ok' }, () => updateDepth(s, { action: 'toggle', enabled: false, revision: assessment.revision }, 'user'))
  await assert.rejects(checkDepth(s, fs, { revision: assessment.revision }), /已更新/)
  assert.deepEqual(depthState(s).checks, [])
  assert.equal(depthState(s).enabled, false)
})

test('Office deliverables must contain the corresponding document parts', async () => {
  const s = enabled()
  const assessment = assess(s, [{ id: 'office', title: 'Word 内容', kind: 'contains', path: 'report.docx', expected: '责任人' }])
  const archive = zipStore([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'word/document.xml', data: '<w:t>责任人</w:t>' }])
  const result = await checkDepth(s, files({ 'report.docx': archive }), { revision: assessment.revision })
  assert.equal(result.checks[0].status, 'passed')
})

test('official Univer SQLite containers are recognized without pretending their contents were reviewed', async () => {
  const s = enabled()
  const assessment = assess(s, [{ id: 'office', title: 'Univer 文件', kind: 'file', path: 'report.univer' }])
  const result = await checkDepth(s, files({ 'report.univer': Buffer.from('SQLite format 3\0fixture') }), { revision: assessment.revision })
  assert.equal(result.checks[0].status, 'passed')
  assert.match(result.checks[0].detail, /不代表专业内容/)
})

test('outer PTC completion rechecks bytes and clears stale review notes after a later write', async () => {
  const s = enabled()
  const assessment = assess(s, [{ id: 'file', title: '任务文件', kind: 'file', path: 'task.md' }])
  const listeners = new Map<string, any>()
  registerProfessionalDepth({ tools: { register() {} }, on: (event: string, fn: any) => listeners.set(event, fn), get: () => undefined }, (value) => value)
  await checkDepth(s, files({ 'task.md': 'first' }), { revision: assessment.revision, reviewNotes: 'Reviewed first version' })
  const before = depthState(s).checks[0].sha256
  const exec = { name: 'run_code', agent: { session: s, ctx: { get: () => files({ 'task.md': 'changed after nested check' }) } } }
  let continued = false
  await listeners.get('tools/post-execute')(exec, {}, () => { continued = true })
  listeners.get('tools/result')(exec, {})
  assert.equal(continued, true)
  assert.notEqual(depthState(s).checks[0].sha256, before)
  assert.equal(depthState(s).checkedRevision, assessment.revision)
  assert.equal(depthState(s).reviewNotes, '')
})

test('native inbox activation exposes tools before prompt assembly', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'depth-hook-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(home, { recursive: true, force: true }) })
  const listeners = new Map<string, any>()
  let definition: any
  let denied = false
  const s = session()
  const agent = { session: s, ctx: { tools: { restrict: () => { denied = true; return () => { denied = false } } } } }
  registerProfessionalDepth({ tools: { register: (value: any) => { definition = value } }, on: (event: string, fn: any) => listeners.set(event, fn), get: () => undefined }, (value) => value)
  listeners.get('agent/created')({ agent })
  assert.equal(denied, true)
  listeners.get('agent/inbox/claimed')({ agent, message: user('启用专业深度。制定计划') })
  assert.equal(denied, false)
  assert.equal((await definition.execute({ action: 'status' }, { agent })).enabled, true)
  assert.match(depthContext(s), /真实需求/)
})

test('preferences restore only the same session; templates require manual selection', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'depth-store-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const store = createDepthStore(home)
  const s = session()
  bindDepthStore(s, store)
  updateDepth(s, { action: 'toggle', enabled: true, revision: 0 }, 'user')
  assert.throws(() => updateDepth(s, { action: 'template', template: {}, revision: 1 }, 'agent'), /用户主动/)
  updateDepth(s, { action: 'template', template: { id: 'template-one', title: '周报', content: '只用当前事实' }, revision: 1 }, 'user')
  const reopened = session()
  bindDepthStore(reopened, store)
  assert.deepEqual(depthState(reopened), depthState(s))
  const child = session('child')
  bindDepthStore(child, store)
  assert.equal(depthState(child).enabled, false)
  assert.equal(depthState(child).template, undefined)
  updateDepth(reopened, { action: 'template', template: null, revision: 2 }, 'user')
  assert.equal(depthState(reopened).template, undefined)
  assert.equal(s.snapshotEvents().length, 0)
})

test('manual template HTTP save preserves Chinese characters split across request chunks', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'depth-template-http-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(home, { recursive: true, force: true }) })
  const routes = new Map<string, any>()
  registerProfessionalDepth({ inject: (_deps: any, fn: any) => fn({ webServer: { register: (route: any) => routes.set(route.path, route.handler) } }), tools: { register() {} }, on() {}, get() {} }, value => value)
  const content = '工程报告资料与验收要求。'.repeat(1000)
  const bytes = Buffer.from(JSON.stringify({ title: '中文模板', content }))
  const request: any = Readable.from([...bytes].map(byte => Buffer.from([byte])))
  request.method = 'POST'; request.url = '/api/agent-pi/professional-depth/templates'
  let status: number, result: any
  await routes.get(request.url)(request, { writeHead: (value: number) => { status = value }, end: (value: string) => { result = JSON.parse(value) } })
  assert.equal(status!, 200)
  assert.equal(result.title, '中文模板')
  assert.equal(result.content, '# 中文模板\n\n' + content + '\n')
})
