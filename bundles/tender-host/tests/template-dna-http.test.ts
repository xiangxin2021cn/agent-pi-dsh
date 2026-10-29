import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { attachHttp, setHttpLlm } from '../src/http.ts'
import { addKbContent, formatSelectedKbContext, getKbTaskSlugs, kbRoot, saveKbMarkdown, stageKbFile } from '../src/kb.ts'
import { distillTemplateDna } from '../src/template-dna.ts'
import { getSessionTemplateBindings } from '../src/template-dna-task.ts'
import { createDocxBuffer } from '../src/export-document.ts'
import { exportMarkdownFile } from '../src/preview-export.ts'
import { inspectTemplateDocx, type TemplateDocxFormat } from '../src/template-dna-office.ts'
import { createAgentPiApiClient } from '../../tender-web/src/client/api-client.js'

const text = '# 工作范围\n\n采用本次项目的实际材料说明工作，不复制旧项目事实。\n\n# 证据组织\n\n保留每项事实的资料来源和实际定位。\n'
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
async function fixture(t: TestContext) {
  const cwd = mkdtempSync(join(tmpdir(), 'agent-pi-dna-http-')), other = join(cwd, 'other-workspace')
  mkdirSync(other)
  const keys = ['AGENT_PI_KB_ROOT', 'AGENT_PI_SKILLS_ROOT', 'AGENT_PI_MODULES_ROOT', 'DSH_HOME']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  process.env.AGENT_PI_KB_ROOT = join(cwd, 'kb')
  process.env.AGENT_PI_SKILLS_ROOT = join(cwd, 'skills')
  process.env.AGENT_PI_MODULES_ROOT = join(cwd, 'modules')
  process.env.DSH_HOME = join(cwd, 'dsh-home')
  const routes: any[] = [], calls: any[] = []
  const agents = new Map(['actual-session', 'second-session'].map(id => [id, { session: { id, header: { cwd } } }]))
  agents.set('foreign-session', { session: { id: 'foreign-session', header: { cwd: other } } })
  const analysis = { layers: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].map(id => ({ id, observations: [{ text: '新任务应提供事实定位。', sourceQuote: '保留每项事实的资料来源和实际定位。' }], unknowns: [] })) }
  setHttpLlm({ async *stream(input: any) { calls.push(input); yield { type: 'text-delta', text: JSON.stringify(analysis) }; yield { type: 'finish', reason: 'stop' } } } as any)
  attachHttp({ webServer: { register(route) { routes.push(route) } }, getAgent: id => agents.get(id), getDefaultModel: () => ({ provider: 'mock-local-test', model: 'mock-template-dna' }) })
  const server = createServer((req, res) => {
    const route = routes.find(row => String(req.url).startsWith(row.path))
    if (!route) { res.writeHead(404); res.end(); return }
    Promise.resolve(route.handler(req, res)).catch(error => { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }, base = 'http://127.0.0.1:' + address.port
  t.after(async () => {
    setHttpLlm(undefined)
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
    rmSync(cwd, { recursive: true, force: true })
  })
  async function request(path = '/api/agent-pi/kb', body?: unknown) {
    const url = new URL(path, base)
    if (!url.searchParams.has('cwd')) url.searchParams.set('cwd', cwd)
    const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const bytes = Buffer.from(await response.arrayBuffer())
    return { status: response.status, headers: response.headers, bytes, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes.toString()) : undefined }
  }
  const entry = addKbContent({ fileName: '用户模板.md', category: '用户模板', slug: 'customer-template', text }).entry
  const ref = { slug: entry.slug, versionId: entry.versionId! }
  return { cwd, other, calls, request, entry, ref }
}

test('real HTTP distill/list/read/select freezes a session-scoped template and updates the shared prompt context', async t => {
  const f = await fixture(t)
  const distilled = await f.request(undefined, { action: 'template_dna_distill', ...f.ref })
  assert.equal(distilled.status, 200, JSON.stringify(distilled.body))
  assert.equal(distilled.body.profile.method, 'deterministic'); assert.equal(f.calls.length, 0)
  const binding = { ...f.ref, dnaId: distilled.body.profile.dnaId }
  const listed = await f.request(undefined, { action: 'template_dna_list', ...f.ref })
  assert.ok(listed.body.profiles.some((row: any) => row.dnaId === binding.dnaId))
  const read = await f.request(undefined, { action: 'template_dna_read', ...binding })
  assert.equal(read.body.profile.source.versionId, f.ref.versionId); assert.equal(read.body.profile.layers.length, 6)
  const selected = await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [f.entry.slug], templateBindings: [binding] })
  assert.equal(selected.status, 200, JSON.stringify(selected.body)); assert.deepEqual(selected.body.templateBindings, [binding])
  const state = await f.request('/api/agent-pi/kb?sessionId=actual-session')
  assert.deepEqual(state.body.templateBindings, [binding]); assert.ok(state.body.selectedSlugs.includes(f.entry.slug))
  assert.match(formatSelectedKbContext('actual-session'), new RegExp(binding.dnaId))
  assert.deepEqual((await f.request('/api/agent-pi/kb?sessionId=second-session')).body.templateBindings, [])
  assert.deepEqual((await f.request()).body.templateBindings, [])
  assert.deepEqual(getSessionTemplateBindings(kbRoot()), [])
  const alternate = distillTemplateDna(kbRoot(), { ...f.ref, analysis: { layers: [{ id: 'L4', observations: [{ text: '材料须定位到事实来源。', sourceQuote: '保留每项事实的资料来源和实际定位。' }], unknowns: [] }] } })
  const replaced = { ...f.ref, dnaId: alternate.dnaId }
  assert.equal((await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [f.entry.slug], templateBindings: [replaced] })).status, 200)
  assert.deepEqual(getSessionTemplateBindings(kbRoot(), 'actual-session'), [replaced])
  assert.equal((await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [f.entry.slug], templateBindings: [] })).status, 200)
  assert.deepEqual(getSessionTemplateBindings(kbRoot(), 'actual-session'), [])
  assert.doesNotMatch(formatSelectedKbContext('actual-session'), /用户已为本次任务选用固定主范本 DNA/)
  await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [f.entry.slug], templateBindings: [binding] })
  assert.equal((await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [] })).status, 200)
  assert.deepEqual(getSessionTemplateBindings(kbRoot(), 'actual-session'), [], 'removing the source from task scope prunes its DNA')
})

test('invalid bindings, missing/draft sessions and expired source scope reject before altering task selection', async t => {
  const f = await fixture(t), profile = distillTemplateDna(kbRoot(), f.ref), binding = { ...f.ref, dnaId: profile.dnaId }
  for (const body of [
    { sessionId: 'actual-session', slugs: [], templateBindings: [binding] },
    { sessionId: 'actual-session', slugs: [f.entry.slug], templateBindings: [{ ...binding, dnaId: '0'.repeat(64) }] },
    { slugs: [f.entry.slug], templateBindings: [binding] },
    { sessionId: 'kb-draft:unclaimed', slugs: [f.entry.slug], templateBindings: [binding] },
    { sessionId: 'ghost-session', slugs: [f.entry.slug], templateBindings: [binding] },
    { sessionId: 'foreign-session', slugs: [f.entry.slug], templateBindings: [binding] },
  ]) {
    const response = await f.request(undefined, { action: 'select', ...body })
    assert.ok(response.status >= 400, JSON.stringify(response.body))
    assert.deepEqual(getKbTaskSlugs(body.sessionId), [], 'failed validation must not partially select KB entries')
    assert.deepEqual(getSessionTemplateBindings(kbRoot(), body.sessionId), [])
  }
  const expired = addKbContent({ fileName: '过期用户模板.md', slug: 'expired-template', category: '用户模板', text: text + '\n过期格式仅供历史查看。\n', metadata: { validUntil: '2000-01-01' } }).entry
  const old = distillTemplateDna(kbRoot(), { slug: expired.slug, versionId: expired.versionId! })
  const refused = await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [expired.slug], templateBindings: [{ slug: expired.slug, versionId: expired.versionId, dnaId: old.dnaId }] })
  assert.ok(refused.status >= 400, JSON.stringify(refused.body)); assert.deepEqual(getKbTaskSlugs('actual-session'), [])
})

test('only explicit intelligent distillation outside local-only mode reaches a mocked DSH model', async t => {
  const f = await fixture(t)
  const local = await f.request(undefined, { action: 'template_dna_distill', ...f.ref, intelligent: true, localOnly: true })
  assert.equal(local.status, 200, JSON.stringify(local.body))
  assert.equal(f.calls.length, 0); assert.notEqual(local.body?.ai?.status, 'completed')
  const response = await f.request(undefined, { action: 'template_dna_distill', ...f.ref, intelligent: true, localOnly: false })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  assert.equal(response.body.ai?.status, 'completed', JSON.stringify(response.body.ai))
  assert.equal(response.body.profile.method, 'grounded-ai'); assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].provider, 'mock-local-test'); assert.ok(f.calls[0].signal)
})

test('preview export uses the bound native format and byte validation, returns headers and keeps unbound behavior', async t => {
  const f = await fixture(t)
  const native: TemplateDocxFormat = { page: { widthTwips: 23811, heightTwips: 16838, orientation: 'landscape', marginTopTwips: 1000, marginRightTwips: 1200, marginBottomTwips: 1300, marginLeftTwips: 1400 }, body: { fontFamily: 'Times New Roman', eastAsiaFontFamily: '仿宋', fontSizePt: 14, spacingAfterTwips: 80 }, headingStyles: [{ styleId: 'Heading1', level: 1, fontFamily: 'Arial', fontSizePt: 18, bold: true }], numbering: [], tables: [], headerFooter: { headers: 0, footers: 0, copySourceText: false }, sectionCount: 1, warnings: [] }
  const sourceFile = join(f.cwd, '办公范本.docx')
  writeFileSync(sourceFile, createDocxBuffer(text, undefined, native))
  const staged = stageKbFile({ path: sourceFile, category: '用户模板', slug: 'office-template', metadata: { regions: ['测试区域'] } })
  const ready = saveKbMarkdown(staged.entry.slug, text).entry
  const profile = distillTemplateDna(kbRoot(), { slug: ready.slug, versionId: ready.versionId! })
  const binding = { slug: ready.slug, versionId: ready.versionId!, dnaId: profile.dnaId }
  const selected = await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [ready.slug], templateBindings: [binding] })
  assert.equal(selected.status, 200, JSON.stringify(selected.body))
  const draft = join(f.cwd, '当前稿.md'); writeFileSync(draft, text)
  const exported = exportMarkdownFile(f.cwd, draft, 'docx', undefined, { sessionId: 'actual-session' })
  const actual = inspectTemplateDocx(exported.body)
  assert.equal(actual.format.page?.widthTwips, 23811); assert.equal(actual.format.body.fontFamily, 'Times New Roman')
  assert.equal(exported.templateArtifactSha256, sha(exported.body)); assert.equal(exported.templateValidation?.artifactSha256, sha(exported.body))
  assert.equal(exported.templateValidation?.machinePassed, false, 'unknown task region needs review even when native formatting matches')
  assert.ok(exported.templateValidation?.gaps.some(gap => /地区/.test(gap)))
  assert.throws(() => exportMarkdownFile(f.cwd, draft, 'docx', '# 工作范围\n只有一章', { sessionId: 'actual-session' }), /未满足|结构|标题/)
  const downloaded = await f.request('/api/agent-pi/files/export', { path: draft, format: 'docx', sessionId: 'actual-session' })
  assert.equal(downloaded.status, 200, downloaded.bytes.toString())
  assert.equal(downloaded.headers.get('x-agent-pi-template-artifact-sha256'), sha(downloaded.bytes))
  assert.ok(downloaded.headers.get('x-agent-pi-template-status'))
  assert.match(downloaded.headers.get('content-disposition') || '', /attachment/)
  assert.equal(inspectTemplateDocx(downloaded.bytes).format.body.fontSizePt, 14)
  const unknownSession = await f.request('/api/agent-pi/files/export', { path: draft, format: 'docx', sessionId: 'foreign-session' })
  assert.ok(unknownSession.status >= 400)
  const plain = exportMarkdownFile(f.cwd, draft, 'docx')
  assert.equal(plain.templateValidation, undefined); assert.equal(inspectTemplateDocx(plain.body).format.body.fontFamily, 'Calibri')
})

test('a bound source that expires after selection is refused by prompt context and export', async t => {
  const f = await fixture(t)
  const entry = addKbContent({ fileName: '有效期范本.md', category: '用户模板', slug: 'dated-template', text, metadata: { validUntil: '2099-12-31' } }).entry
  const profile = distillTemplateDna(kbRoot(), { slug: entry.slug, versionId: entry.versionId! })
  const binding = { slug: entry.slug, versionId: entry.versionId!, dnaId: profile.dnaId }
  assert.equal((await f.request(undefined, { action: 'select', sessionId: 'actual-session', slugs: [entry.slug], templateBindings: [binding] })).status, 200)
  const draft = join(f.cwd, '本次稿.md'); writeFileSync(draft, text)
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2100-01-01T00:00:00Z') })
  try {
    assert.match(formatSelectedKbContext('actual-session'), /无法校验|有效期|不适用/)
    assert.throws(() => exportMarkdownFile(f.cwd, draft, 'docx', undefined, { sessionId: 'actual-session' }), /有效期|不适用/)
    assert.deepEqual(getSessionTemplateBindings(kbRoot(), 'actual-session'), [binding], 'a failed export does not silently replace the historical binding')
  } finally { t.mock.timers.reset() }
})

test('the Blob client keeps the old download shape and exposes optional byte-validation headers', async () => {
  let template = false
  const client = createAgentPiApiClient({ fetchImpl: async () => new Response(new Uint8Array([80, 75, 3, 4]), { headers: {
    'content-disposition': "attachment; filename*=UTF-8''%E6%B5%8B%E8%AF%95.docx",
    ...(template ? { 'x-agent-pi-template-status': 'review', 'x-agent-pi-template-artifact-sha256': 'a'.repeat(64) } : {}),
  } }) })
  const plain = await client.apiBlob('/api/agent-pi/files/export', 'C:/isolated')
  assert.deepEqual(Object.keys(plain).sort(), ['blob', 'filename']); assert.equal(plain.filename, '测试.docx'); assert.ok(plain.blob instanceof Blob)
  assert.deepEqual([...new Uint8Array(await plain.blob.arrayBuffer())], [80, 75, 3, 4])
  template = true
  const bound = await client.apiBlob('/api/agent-pi/files/export', 'C:/isolated')
  assert.ok(bound.blob instanceof Blob); assert.equal(bound.filename, '测试.docx')
  assert.equal(bound.templateStatus, 'review'); assert.equal(bound.templateArtifactSha256, 'a'.repeat(64))
})
