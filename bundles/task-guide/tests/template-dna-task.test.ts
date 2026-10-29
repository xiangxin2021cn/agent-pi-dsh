import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { emptyTask, reviseTask, validateTask } from '../../../packages/professional-tasks/task.ts'
import { deliverableInputFingerprint } from '../../../packages/professional-tasks/verification.ts'
import type { Deliverable } from '../../../packages/professional-tasks/types.ts'
import { stageKbFile, saveKbMarkdown, kbRoot } from '../../tender-host/src/kb.ts'
import { createDocxBuffer } from '../../tender-host/src/export-document.ts'
import { distillTemplateDna } from '../../tender-host/src/template-dna.ts'
import { setSessionTemplateBindings } from '../../tender-host/src/template-dna-task.ts'
import { registerTaskGuide } from '../src/plugin.ts'
import { verifyTaskDeliverable } from '../src/verify.ts'
import { readTaskTemplateState } from '../src/template.ts'

const text = '# 工作范围\n\n依据条款 1 逐项说明本次项目的工作范围。\n\n# 证据组织\n\n按资料原件的具体页码复核每项事实。\n'
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function fixture(t: any) {
  const cwd = mkdtempSync(join(tmpdir(), 'task-template-dna-'))
  const previous = Object.fromEntries(['AGENT_PI_KB_ROOT', 'DSH_HOME'].map(key => [key, process.env[key]]))
  process.env.AGENT_PI_KB_ROOT = join(cwd, 'kb'); process.env.DSH_HOME = join(cwd, 'dsh')
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; rmSync(cwd, { recursive: true, force: true }) })
  const bytes = createDocxBuffer(text), path = join(cwd, '本次成果.docx'), source = join(cwd, '用户范本.docx')
  writeFileSync(path, bytes); writeFileSync(source, bytes)
  const staged = stageKbFile({ path: source, category: '用户模板', slug: 'task-template' })
  const entry = saveKbMarkdown(staged.entry.slug, text).entry
  const profile = distillTemplateDna(kbRoot(), { slug: entry.slug, versionId: entry.versionId! })
  const binding = { slug: entry.slug, versionId: entry.versionId!, dnaId: profile.dnaId }
  const alternate = distillTemplateDna(kbRoot(), { ...binding, analysis: { layers: [{ id: 'L4', observations: [{ text: '逐项核对事实定位。', sourceQuote: '按资料原件的具体页码复核每项事实。' }], unknowns: [] }] } })
  const other = { ...binding, dnaId: alternate.dnaId }
  const services = new Map<string, any>(), definitions = new Map<string, any>(), events: any[] = []
  const session = { id: 'main', header: { cwd } }, reads: string[] = []
  let onRead: (() => void) | undefined, denied = false
  const fs = {
    resolve: async (path: string, options: any) => { const target = resolve(options.cwd, path); assert.ok(target.startsWith(cwd)); return target },
    stat: async (target: string) => { try { return { type: statSync(target).isFile() ? 'file' : 'directory' } } catch { return undefined } },
    readBytes: async (target: string) => { if (denied) throw new Error('测试授权文件系统拒绝访问'); reads.push(target); const result = readFileSync(target); const hook = onRead; onRead = undefined; hook?.(); return result },
  }
  const agent = { session, ctx: { get: (name: string) => name === 'fs' ? fs : services.get(name) }, inbox: {}, status: 'idle' }
  services.set('sessions', { get: (id: string) => id === 'main' ? session : undefined })
  services.set('agents', { get: (id: string) => id === 'main' ? agent : undefined, list: () => [agent] })
  const ctx = { get: (name: string) => services.get(name), provide: (name: string, value: any) => services.set(name, value), emit: (name: string, value: any) => events.push({ name, value }), on() {}, tools: { register: (value: any) => definitions.set(value.name, value), schemas: () => [] }, systemPrompt: { section() {} }, inject() {} }
  const service = registerTaskGuide(ctx, value => value, cwd)
  const row: Deliverable = { id: 'document', title: '本次成果', path, evidenceIds: [], requirementIds: [], stepIds: [], signature: 'not_required', status: 'draft', checks: [{ kind: 'professional', status: 'passed', detail: '本次项目内容已经独立复核。', fingerprint: hash(bytes) }] }
  const bind = (value: typeof binding | undefined) => setSessionTemplateBindings(kbRoot(), 'main', value ? [value] : [], value ? [value.slug] : [])
  const seed = () => { const state = service.read('main'); return service.update('main', { brief: { ...state.brief, objective: '形成按用户格式编制的当前文稿' }, needsAssessment: false, deliverables: [row] }, state.revision, 'host') }
  return { cwd, path, bytes, profile, binding, other, fs, service, row, reads, bind, seed, events, setReadHook: (hook: () => void) => { onRead = hook }, deny: () => { denied = true } }
}

test('optional host template state preserves legacy fingerprints and cannot be forged by user/model patches', () => {
  const task = emptyTask('legacy'), row: Deliverable = { id: 'd', title: 'Legacy', path: 'legacy.md', evidenceIds: [], requirementIds: [], stepIds: [], status: 'draft', signature: 'not_required', checks: [] }
  assert.equal(deliverableInputFingerprint(task, row), deliverableInputFingerprint({ ...task, templateBindings: undefined, templateWritingFingerprint: undefined, templateBindingIssue: undefined }, row))
  validateTask(task)
  const binding = { slug: 'customer-template', versionId: 'a'.repeat(64), dnaId: 'b'.repeat(64) }
  for (const actor of ['agent', 'user'] as const) {
    assert.throws(() => reviseTask(task, { templateBindings: [binding] }, 0, actor), /宿主/)
    assert.throws(() => reviseTask(task, { templateWritingFingerprint: 'a'.repeat(64) }, 0, actor), /宿主/)
    assert.throws(() => reviseTask(task, { deliverables: [{ ...row, checks: [{ kind: 'template', status: 'passed', detail: '伪造检查', fingerprint: 'a'.repeat(64) }] }] }, 0, actor), /宿主/)
  }
})

test('actual authorized DOCX bytes are checked and replacing/removing DNA invalidates prior acceptance', async t => {
  const f = fixture(t); f.bind(f.binding); f.seed()
  const checked = await f.service.verifyDeliverable('main', f.row.id)
  assert.equal(checked.verification.status, 'passed', JSON.stringify(checked.verification.unresolved))
  assert.ok(checked.deliverable.checks.some(row => row.kind === 'template' && row.status === 'passed' && row.fingerprint === hash(f.bytes)))
  assert.ok(checked.deliverable.checks.some(row => row.kind === 'professional' && row.status === 'passed'), 'native validation retains independent professional review')
  assert.ok(f.reads.includes(f.path))
  const accepted = f.service.update('main', { deliverables: [{ ...checked.deliverable, status: 'accepted', signature: 'signed' }] }, checked.task.revision, 'user')
  assert.equal(accepted.deliverables[0].status, 'accepted')
  f.bind(f.other)
  const stale = f.service.read('main')
  assert.equal(stale.templateBindings?.[0].dnaId, f.other.dnaId); assert.equal(stale.deliverables[0].status, 'stale'); assert.equal(stale.deliverables[0].verification?.status, 'stale')
  assert.equal(stale.deliverables[0].signature, 'pending'); assert.ok(stale.acceptedHistory.some(row => row.deliverable.status === 'accepted'))
  const fingerprint = deliverableInputFingerprint(stale, stale.deliverables[0])
  f.bind(undefined)
  const removed = f.service.read('main')
  assert.equal(removed.templateBindings, undefined); assert.notEqual(deliverableInputFingerprint(removed, removed.deliverables[0]), fingerprint)
})

test('missing known headings fail actual-byte checks and an executor filesystem denial never grants a receipt', async t => {
  const f = fixture(t); f.bind(f.binding)
  const bad = createDocxBuffer('# 工作范围\n只包含本次条款 1。'); writeFileSync(f.path, bad)
  const state = { ...emptyTask('main'), ...readTaskTemplateState({ sessionId: 'main' }), needsAssessment: false }
  const failed = await verifyTaskDeliverable(f.fs, f.cwd, state, { ...f.row, checks: [{ ...f.row.checks[0], fingerprint: hash(bad) }] })
  assert.equal(failed.checks.find(row => row.kind === 'template')?.status, 'failed'); assert.equal(failed.verification?.status, 'failed')
  f.deny()
  const denied = await verifyTaskDeliverable(f.fs, f.cwd, state, f.row)
  assert.equal(denied.checks.find(row => row.kind === 'file')?.status, 'failed'); assert.equal(denied.verification?.artifactSha256, null)
})

test('a DNA change during an asynchronous authorized read is retained as an unresolved race', async t => {
  const f = fixture(t); f.bind(f.binding)
  const task = { ...emptyTask('main'), ...readTaskTemplateState({ sessionId: 'main' }), needsAssessment: false }
  f.setReadHook(() => f.bind(f.other))
  const checked = await verifyTaskDeliverable(f.fs, f.cwd, task, f.row)
  assert.equal(checked.verification?.status, 'review'); assert.ok(checked.verification?.unresolved.some(row => /审核过程中变化/.test(row)))
})
