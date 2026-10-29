import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { retainKnowledgeVersion } from '../src/knowledge-versions.ts'
import type { KbEntry, KbManifest } from '../src/kb.ts'
import { distillTemplateDna } from '../src/template-dna.ts'
import { getSessionTemplateBindings, setSessionTemplateBindings, pruneSessionTemplateBindings, formatTemplateDnaTaskContext, verifySessionTemplateArtifact } from '../src/template-dna-task.ts'
import { distillTemplateDnaWithLlm } from '../src/template-dna-llm.ts'

const text = '# 工作范围\n\n每项实施说明必须给出可核对的来源与证据。\n\n# 编写依据\n\n使用本项目实际资料。\n'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-dna-task-'))
  mkdirSync(join(root, 'files'))
  const path = join(root, 'files', '范本.md'); writeFileSync(path, text)
  const entry: KbEntry = { slug: 'user-template', name: '中立办公范本', category: '用户模板', sourcePath: path, managedPath: path, sourceHash: createHash('sha256').update(text).digest('hex'), sizeBytes: Buffer.byteLength(text), chunkCount: 1, parseStatus: 'ready', createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z' }
  const manifest: KbManifest = { schemaVersion: 1, slug: entry.slug, name: entry.name, category: entry.category, sourcePath: path, indexedAt: entry.createdAt, chunks: [{ id: 'body', title: '全文', startLine: 1, endLine: 7, startOffset: 0, endOffset: text.length, metadata: { headingPath: [], clauseRefs: [], tableRefs: [], boqRefs: [] } }] }
  const versionId = retainKnowledgeVersion(root, entry, manifest)!
  const ref = { slug: entry.slug, versionId }, profile = distillTemplateDna(root, ref)
  const binding = { ...ref, dnaId: profile.dnaId }
  return { root, ref, profile, binding, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

test('a task uses one fixed primary template and never inherits another session or an unclaimed draft', () => {
  const f = fixture()
  try {
    setSessionTemplateBindings(f.root, 'session-a', [f.binding], [f.ref.slug])
    assert.deepEqual(getSessionTemplateBindings(f.root, 'session-a'), [f.binding])
    for (const session of ['session-b', 'active', '', 'kb-draft:fresh']) assert.deepEqual(getSessionTemplateBindings(f.root, session), [])
    assert.match(formatTemplateDnaTaskContext(f.root, 'session-a'), /writing-dna-skill/)
    assert.match(formatTemplateDnaTaskContext(f.root, 'session-a'), new RegExp(f.profile.dnaId))
    assert.equal(formatTemplateDnaTaskContext(f.root, 'session-b'), '')
    assert.throws(() => setSessionTemplateBindings(f.root, 'session-a', [f.binding, f.binding], [f.ref.slug]), /主范本|Too big/)
    assert.throws(() => setSessionTemplateBindings(f.root, 'session-a', [f.binding], []), /知识库范围/)
    assert.deepEqual(getSessionTemplateBindings(f.root, 'session-a'), [f.binding])
  } finally { f.dispose() }
})

test('deselection prunes only its session; source/artifact tampering cannot become a successful task context', () => {
  const f = fixture()
  try {
    for (const session of ['session-a', 'session-b']) setSessionTemplateBindings(f.root, session, [f.binding], [f.ref.slug])
    pruneSessionTemplateBindings(f.root, 'session-a', [])
    assert.deepEqual(getSessionTemplateBindings(f.root, 'session-a'), [])
    assert.deepEqual(getSessionTemplateBindings(f.root, 'session-b'), [f.binding])
    writeFileSync(f.profile.artifacts.L2.path, '被改变的分层内容')
    assert.match(formatTemplateDnaTaskContext(f.root, 'session-b'), /无法校验/)
    assert.throws(() => verifySessionTemplateArtifact(f.root, 'session-b', { bytes: Buffer.from(text), format: 'md' }), /变化|缺失/)
  } finally { f.dispose() }
})

test('checks are bound to actual artifact bytes and fixed DNA instead of reusing an earlier pass', () => {
  const f = fixture()
  try {
    setSessionTemplateBindings(f.root, 'session-a', [f.binding], [f.ref.slug])
    const first = verifySessionTemplateArtifact(f.root, 'session-a', { bytes: Buffer.from(text), format: 'md' })
    const changed = verifySessionTemplateArtifact(f.root, 'session-a', { bytes: Buffer.from('# 工作范围\n缺了依据'), format: 'md' })
    assert.notEqual(first.receipts[0]!.artifactSha256, changed.receipts[0]!.artifactSha256)
    assert.equal(changed.receipts[0]!.status, 'failed')
    assert.equal(changed.receipts[0]!.dnaId, f.profile.dnaId)
    assert.equal(changed.receipts[0]!.sourceVersionId, f.ref.versionId)
  } finally { f.dispose() }
})

const dependencies = { createMessage: (value: unknown) => value, skillText: 'writing-dna-skill 六层提取，单范本适配。' }
test('no configured AI makes zero requests and clearly retains deterministic extraction', async () => {
  const f = fixture(); let requests = 0
  try {
    const result = await distillTemplateDnaWithLlm(f.root, { ...f.ref, edition: 'mainline' }, { async *stream() { requests++; yield { type: 'finish', reason: 'stop' } } }, dependencies)
    assert.equal(requests, 0); assert.equal(result.profile.method, 'deterministic'); assert.equal(result.ai.status, 'unavailable')
  } finally { f.dispose() }
})

test('the AI adapter uses the actual fixed manuscript and rejects ungrounded rules while keeping native facts', async () => {
  const f = fixture(); let sent = ''
  try {
    const result = await distillTemplateDnaWithLlm(f.root, { ...f.ref, edition: 'mainline', provider: 'fixture', model: 'offline-mock' }, {
      async *stream(options) {
        sent = JSON.stringify(options.messages)
        yield { type: 'text-delta', text: JSON.stringify({ layers: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].map(id => ({ id, observations: id === 'L5' ? [{ text: '实施说明附真实来源。', sourceQuote: '每项实施说明必须给出可核对的来源与证据。' }, { text: '必须有10000字。', sourceQuote: '此句不存在于范本' }] : [], unknowns: ['专业深度需结合当前任务审阅。'] })) }) }
        yield { type: 'finish', reason: 'stop' }
      },
    }, dependencies)
    assert.match(sent, /每项实施说明必须给出可核对的来源与证据/)
    assert.match(sent, /single-template-contract/)
    assert.equal(result.ai.status, 'completed'); assert.equal(result.profile.method, 'grounded-ai')
    assert.notEqual(result.profile.dnaId, f.profile.dnaId)
    assert.ok(result.profile.layers[4]!.observations.some(row => row.includes('附真实来源')))
    assert.ok(!result.profile.layers[4]!.observations.some(row => row.includes('10000')))
  } finally { f.dispose() }
})

test('aborted, malformed and timed-out AI keeps the original deterministic profile and reports failure', async () => {
  const f = fixture()
  try {
    const input = { ...f.ref, edition: 'tender' as const, provider: 'fixture', model: 'offline-mock' }
    const streams = [
      { async *stream() { yield { type: 'finish', reason: 'aborted' } } },
      { async *stream() { yield { type: 'text-delta', text: 'invalid json' }; yield { type: 'finish', reason: 'stop' } } },
      { async *stream(options: Record<string, unknown>) { await new Promise<void>(resolve => (options.signal as AbortSignal).addEventListener('abort', () => resolve(), { once: true })); yield { type: 'finish', reason: 'aborted' } } },
    ]
    for (const llm of streams) {
      const result = await distillTemplateDnaWithLlm(f.root, input, llm, { ...dependencies, timeoutMs: 15 })
      assert.equal(result.ai.status, 'failed'); assert.equal(result.profile.method, 'deterministic')
      assert.ok(result.ai.reason)
    }
    assert.equal(readFileSync(f.profile.artifacts.summary.path, 'utf8').includes('Writing'), true)
  } finally { f.dispose() }
})


test('incomplete, duplicate or entirely fabricated AI layers fail back to the retained baseline', async () => {
  const f=fixture(),valid={id:'L1',observations:[{text:'实施说明附真实来源。',sourceQuote:'每项实施说明必须给出可核对的来源与证据。'}],unknowns:[]}
  const layer=(id:string)=>({...valid,id})
  const cases=[
    {label:'empty',layers:[]},
    {label:'duplicate',layers:['L1','L2','L3','L4','L5','L5'].map(layer)},
    {label:'missing sixth layer',layers:['L1','L2','L3','L4','L5'].map(layer)},
    {label:'all fabricated evidence',layers:['L1','L2','L3','L4','L5','L6'].map(id=>({id,observations:[{text:'要求五级标题。',sourceQuote:'这段所谓引文从未出现在固定的范本文档中。'}],unknowns:[]}))},
  ]
  try {
    for(const example of cases){
      const result=await distillTemplateDnaWithLlm(f.root,{...f.ref,edition:'mainline',provider:'fixture',model:'offline-mock'},{async *stream(){yield {type:'text-delta',text:JSON.stringify({layers:example.layers})};yield {type:'finish',reason:{kind:'stop'}}}},dependencies)
      assert.equal(result.ai.status,'failed',example.label);assert.equal(result.profile.method,'deterministic',example.label);assert.equal(result.profile.dnaId,f.profile.dnaId,example.label);assert.ok(result.ai.reason,example.label)
    }
  } finally {f.dispose()}
})
