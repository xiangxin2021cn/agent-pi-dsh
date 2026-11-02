import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { captureTaskMandate } from '../src/task-mandate.ts'
import { retainKnowledgeVersion } from '../src/knowledge-versions.ts'
import { distillTemplateDna } from '../src/template-dna.ts'
import type { ProfessionalTask } from '../../../packages/professional-tasks/types.ts'

const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const json = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2)) }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-mandate-'))
  const knowledgeRoot = join(root, '知识库'), skillRoot = join(root, '技能'), sessionId = 'original-session'
  mkdirSync(knowledgeRoot); mkdirSync(skillRoot)
  const task = { sessionId, revision: 1, brief: { objective: '编制项目报告', scope: '已提供资料', webDiligence: 'forbidden' }, briefProvenance: { objective: { origin: 'user', status: 'explicit', updatedRevision: 1 }, scope: { origin: 'inference', status: 'provisional', updatedRevision: 1 }, webDiligence: { origin: 'user', status: 'explicit', updatedRevision: 1 } }, directives: [{ id: 'scope', key: 'scope', source: 'user', kind: 'constraint', text: '只写已登记项目资料', status: 'active', messageId: 'human-1', updatedRevision: 1 }], plan: [], evidence: [], findings: [], deliverables: [], quality: { checks: [] }, recentChanges: [], updatedAt: 'first' } as unknown as ProfessionalTask
  const input = { sessionId, task, knowledgeRoot, skillRoots: [skillRoot], skillSlugs: [] as string[], permissionPolicy: { sandbox: { mode: 'workspace-write', workspaceRoot: root }, approval: 'ask', tools: ['read', 'write'] } }
  return { root, knowledgeRoot, skillRoot, input, close() { assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.match(root, /agent-pi-mandate-/); rmSync(root, { recursive: true, force: true }) } }
}
function knowledge(f: ReturnType<typeof fixture>, text = '# 用户报告范本\n\n## 范围\n\n按真实项目资料编写。\n', slug = 'user-template') {
  const path = join(f.knowledgeRoot, 'files', slug + '.md')
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text)
  const entry: any = { slug, name: '用户报告范本', category: '用户模板', sourcePath: path, managedPath: path, sourceHash: sha(text), sizeBytes: Buffer.byteLength(text), chunkCount: 1, parseStatus: 'ready', createdAt: 'first', updatedAt: 'first' }
  const manifest: any = { schemaVersion: 1, slug, name: entry.name, category: entry.category, sourcePath: path, indexedAt: 'first', chunks: [{ id: 'scope', title: '范围', startLine: 1, endLine: 5, startOffset: 0, endOffset: text.length, metadata: { headingPath: ['范围'], clauseRefs: [], tableRefs: [], boqRefs: [] } }] }
  entry.versionId = retainKnowledgeVersion(f.knowledgeRoot, entry, manifest)!
  json(join(f.knowledgeRoot, 'registry.json'), { schemaVersion: 1, entries: [entry] })
  json(join(f.knowledgeRoot, 'index', slug + '.json'), manifest)
  json(join(f.knowledgeRoot, 'task-selection.json'), { schemaVersion: 1, bySession: { [f.input.sessionId]: [slug] } })
  return { entry, manifest, text }
}
function bind(f: ReturnType<typeof fixture>, ref: { slug: string; versionId: string; dnaId: string }) {
  json(join(f.knowledgeRoot, 'template-task-bindings', sha(f.input.sessionId) + '.json'), { schemaVersion: 1, sessionId: f.input.sessionId, bindings: [ref] })
}

test('mandate retains only human execution constraints while ignoring task progress and polling churn', () => {
  const f = fixture()
  try {
    const first = captureTaskMandate(f.input)
    f.input.task.revision++; f.input.task.updatedAt = 'later'; f.input.task.brief.scope = '模型补充的暂定范围'
    f.input.task.plan.push({ id: 'draft', title: '编写', status: 'done' } as any)
    f.input.task.findings.push({ id: 'finding', title: '已发现' } as any)
    f.input.task.deliverables.push({ id: 'report', path: 'report.docx' } as any)
    f.input.task.quality.checks.push({ id: 'result', status: 'passed' } as any)
    f.input.task.directives[0]!.updatedRevision++
    assert.deepEqual(captureTaskMandate(f.input), first)
    f.input.task.directives[0]!.text = '新增明确用户范围'
    assert.notEqual(captureTaskMandate(f.input).fingerprint, first.fingerprint)
    f.input.task.directives[0]!.status = 'revoked'
    const revoked = captureTaskMandate(f.input)
    f.input.task.brief.scope = '已明确范围'; f.input.task.briefProvenance.scope = { origin: 'source', status: 'confirmed', updatedRevision: 2 }
    assert.notEqual(captureTaskMandate(f.input).fingerprint, revoked.fingerprint)
    assert.throws(() => captureTaskMandate({ ...f.input, sessionId: 'another-session' }), /主会话/)
  } finally { f.close() }
})

test('real retained knowledge versions and selected scope affect the mandate, incidental times do not', () => {
  const f = fixture()
  try {
    const { entry, manifest } = knowledge(f)
    const first = captureTaskMandate(f.input)
    assert.equal(first.knowledge[0]!.versionId, entry.versionId)
    entry.updatedAt = 'later'; manifest.indexedAt = 'later'
    json(join(f.knowledgeRoot, 'registry.json'), { schemaVersion: 1, entries: [entry], updatedAt: 'later' })
    json(join(f.knowledgeRoot, 'index', entry.slug + '.json'), manifest)
    json(join(f.knowledgeRoot, 'task-selection.json'), { schemaVersion: 1, bySession: { [f.input.sessionId]: [entry.slug], unrelated: ['other'] } })
    assert.deepEqual(captureTaskMandate(f.input), first)
    knowledge(f, '# 新版本\n\n## 新范围\n\n新资料。\n')
    assert.notEqual(captureTaskMandate(f.input).fingerprint, first.fingerprint)
    json(join(f.knowledgeRoot, 'task-selection.json'), { schemaVersion: 1, bySession: {} })
    assert.deepEqual(captureTaskMandate(f.input).knowledge, [])
  } finally { f.close() }
})

test('knowledge manuscript, locator and missing selected entries fail closed without silently dropping scope', () => {
  const f = fixture()
  try {
    const { entry, manifest, text } = knowledge(f)
    writeFileSync(entry.managedPath, text + '未登记变更')
    assert.throws(() => captureTaskMandate(f.input), /正文.*不一致/)
    writeFileSync(entry.managedPath, text)
    manifest.chunks[0].title = '新定位'
    json(join(f.knowledgeRoot, 'index', entry.slug + '.json'), manifest)
    assert.throws(() => captureTaskMandate(f.input), /定位.*不一致/)
    json(join(f.knowledgeRoot, 'registry.json'), { schemaVersion: 1, entries: [] })
    assert.throws(() => captureTaskMandate(f.input), /缺失/)
    writeFileSync(join(f.knowledgeRoot, 'task-selection.json'), '{')
    assert.throws(() => captureTaskMandate(f.input), SyntaxError)
  } finally { f.close() }
})

test('legacy knowledge stays usable with actual byte fingerprints and unrelated entries stay out of scope', () => {
  const f = fixture()
  try {
    const { entry } = knowledge(f)
    delete entry.versionId
    json(join(f.knowledgeRoot, 'registry.json'), { schemaVersion: 1, entries: [entry, { slug: 'unselected', managedPath: join(f.root, 'must-not-read') }] })
    const first = captureTaskMandate(f.input)
    assert.equal(first.knowledge[0]!.versionId, null)
    writeFileSync(entry.managedPath, '# Legacy content changed\n')
    assert.notEqual(captureTaskMandate(f.input).fingerprint, first.fingerprint)
  } finally { f.close() }
})

test('actual distillation bindings and DNA layers are checked; new valid DNA changes the snapshot', () => {
  const f = fixture()
  try {
    const { entry } = knowledge(f)
    const profile = distillTemplateDna(f.knowledgeRoot, { slug: entry.slug, versionId: entry.versionId })
    bind(f, { slug: entry.slug, versionId: entry.versionId, dnaId: profile.dnaId })
    const first = captureTaskMandate(f.input)
    assert.equal(first.templates[0]!.dnaId, profile.dnaId)
    const profilePath = join(f.knowledgeRoot, 'template-dna', entry.slug, entry.versionId, profile.dnaId, 'profile.json')
    profile.createdAt = 'later'; json(profilePath, profile)
    assert.deepEqual(captureTaskMandate(f.input), first)
    writeFileSync(profile.artifacts.L3.path, 'changed scope')
    assert.throws(() => captureTaskMandate(f.input), /分层产物/)
    const second = distillTemplateDna(f.knowledgeRoot, { slug: entry.slug, versionId: entry.versionId, analysis: { layers: [{ id: 'L3', observations: [{ text: '按已提供项目资料限定范围', sourceQuote: '按真实项目资料编写。' }], unknowns: [] }] } })
    bind(f, { slug: entry.slug, versionId: entry.versionId, dnaId: second.dnaId })
    assert.notEqual(captureTaskMandate(f.input).fingerprint, first.fingerprint)
    json(join(f.knowledgeRoot, 'task-selection.json'), { schemaVersion: 1, bySession: {} })
    assert.throws(() => captureTaskMandate(f.input), /选用知识范围/)
  } finally { f.close() }
})

test('stage skill manifests and resolved permission changes invalidate the snapshot without implicit grants', () => {
  const f = fixture()
  try {
    const path = join(f.skillRoot, 'report-skill', 'SKILL.md')
    mkdirSync(dirname(path)); writeFileSync(path, '# Report method\n')
    f.input.skillSlugs = ['report-skill']
    const first = captureTaskMandate(f.input)
    assert.equal(first.skills[0]!.manifestSha256, sha('# Report method\n'))
    writeFileSync(path, '# Updated report method\n')
    assert.notEqual(captureTaskMandate(f.input).fingerprint, first.fingerprint)
    const next = captureTaskMandate(f.input)
    f.input.permissionPolicy.approval = 'never'
    assert.notEqual(captureTaskMandate(f.input).fingerprint, next.fingerprint)
    const missing = captureTaskMandate({ ...f.input, permissionPolicy: undefined })
    assert.equal(missing.policyState, 'not_configured')
    assert.notEqual(missing.policySha256, next.policySha256)
    assert.throws(() => captureTaskMandate({ ...f.input, skillSlugs: ['missing'] }), /技能缺失/)
    assert.throws(() => captureTaskMandate({ ...f.input, skillSlugs: ['../outside'] }), /标识无效/)
  } finally { f.close() }
})

test('native scoped catalog winners override fallback roots and support flat instruction files', () => {
  const f = fixture()
  try {
    const fallback = join(f.skillRoot, 'report-skill', 'SKILL.md')
    mkdirSync(dirname(fallback)); writeFileSync(fallback, '# Lower-priority fallback')
    const selected = join(f.root, 'native-custom-report.md')
    writeFileSync(selected, '# Actual native winning method')
    const input = { ...f.input, skillSlugs: ['report-skill'], skillFiles: [{ id: 'report-skill', path: selected, root: f.root }] }
    const result = captureTaskMandate(input)
    assert.equal(result.skills[0]!.sourcePath, resolve(selected))
    assert.equal(result.skills[0]!.manifestSha256, sha('# Actual native winning method'))
    writeFileSync(fallback, '# This fallback is not selected')
    assert.deepEqual(captureTaskMandate(input), result)
    assert.throws(() => captureTaskMandate({ ...input, skillFiles: [] }), /没有当前宿主目录赢家/)
    assert.throws(() => captureTaskMandate({ ...input, skillFiles: [...input.skillFiles, ...input.skillFiles] }), /重复/)
    assert.throws(() => captureTaskMandate({ ...input, skillFiles: [{ ...input.skillFiles[0]!, id: 'unselected' }] }), /不属于当前阶段/)
    assert.throws(() => captureTaskMandate({ ...input, skillFiles: [{ ...input.skillFiles[0]!, root: f.skillRoot }] }), /登记目录/)
  } finally { f.close() }
})

test('oversized metadata and source paths outside the registered knowledge root are rejected before reading', () => {
  const f = fixture()
  try {
    knowledge(f)
    const selection = join(f.knowledgeRoot, 'task-selection.json')
    truncateSync(selection, 8 * 1024 * 1024 + 1)
    assert.throws(() => captureTaskMandate(f.input), /受限大小/)
    const { entry } = knowledge(f)
    entry.managedPath = join(f.root, 'outside.md'); writeFileSync(entry.managedPath, 'outside')
    json(join(f.knowledgeRoot, 'registry.json'), { schemaVersion: 1, entries: [entry] })
    assert.throws(() => captureTaskMandate(f.input), /登记目录/)
  } finally { f.close() }
})

test('knowledge and skill directory junctions cannot expand snapshot read authority', () => {
  const f = fixture()
  try {
    const outside = join(f.root, 'outside'), linked = join(f.skillRoot, 'linked-skill')
    mkdirSync(outside); writeFileSync(join(outside, 'SKILL.md'), '# Outside')
    symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => captureTaskMandate({ ...f.input, skillSlugs: ['linked-skill'] }), /符号链接或目录联接/)
    assert.equal(readFileSync(join(outside, 'SKILL.md'), 'utf8'), '# Outside')
  } finally { f.close() }
})
