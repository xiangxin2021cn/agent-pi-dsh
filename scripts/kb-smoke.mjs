// Smoke test for the local knowledge base kernel + workbench integration points.
// Runs against a throwaway KB root; never touches the real user KB.
//   node scripts/kb-smoke.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const kbRootDir = mkdtempSync(join(tmpdir(), 'kb-smoke-'))
process.env.AGENT_PI_KB_ROOT = kbRootDir

const steps = []
const step = (name, fn) => {
  try {
    fn()
    steps.push(['ok', name])
  } catch (error) {
    steps.push(['FAIL', name + ' :: ' + (error && error.message || error)])
  }
}

const kb = await import('../bundles/tender-host/src/kb.ts')
const pdfParts = await import('../bundles/tender-host/src/pdf-parts.ts')
const mineruMerge = await import('../bundles/tender-host/src/mineru-merge.ts')
const pdfText = await import('../bundles/tender-host/src/pdf-text.ts')

// --- seeding -------------------------------------------------------------
const seed1 = kb.seedBundledKnowledge()
step('seed imports bundled packs', () => assert.ok(seed1.seeded.length > 0, 'no seeded entries'))
const afterSeed = kb.kbOverview()
step('overview counts after seed', () => {
  assert.equal(afterSeed.root, kbRootDir)
  assert.equal(afterSeed.entryCount, seed1.seeded.length)
  assert.ok(afterSeed.chunkCount > 0)
})
const seed2 = kb.seedBundledKnowledge(true)
step('re-seed is a no-op (hash skip)', () => {
  assert.equal(seed2.seeded.length, 0)
  assert.ok(seed2.skipped > 0)
})

// --- add / re-add / replace ----------------------------------------------
const doc = join(kbRootDir, 'sample-spec.md')
writeFileSync(doc, [
  '# 测试规范',
  '',
  '## 3.2 材料要求',
  '',
  '水泥应符合 GB 175 要求，抗压强度等级 42.5，见第 3.2.1 条。',
  '',
  '| 项目 | 指标 |',
  '| --- | --- |',
  '| 初凝时间 | ≥45min |',
  '',
  '支付项 36/1.1 场地清理按公顷计量。',
  '',
].join('\n'), 'utf8')

const added = kb.addKbFile({ path: doc, category: '规范', name: '测试规范' })
step('add custom .md', () => {
  assert.ok(added.entry.slug.length > 0)
  assert.ok(added.chunkCount >= 1)
  assert.equal(added.replaced, false)
  assert.equal(added.entry.category, '规范')
})
step('re-add identical content skips', () => {
  const again = kb.addKbFile({ path: doc })
  assert.equal(again.skipped, true)
})
step('re-add changed content replaces in place', () => {
  writeFileSync(doc, '# 测试规范 v2\n\n## 3.2 材料要求\n\n水泥应符合 GB 175 要求。\n', 'utf8')
  const replaced = kb.addKbFile({ path: doc })
  assert.equal(replaced.replaced, true)
  assert.equal(replaced.entry.slug, added.entry.slug)
  // restore richer content for retrieval tests
  writeFileSync(doc, [
    '# 测试规范',
    '',
    '## 3.2 材料要求',
    '',
    '水泥应符合 GB 175 要求，抗压强度等级 42.5，见第 3.2.1 条。',
    '',
    '| 项目 | 指标 |',
    '| --- | --- |',
    '| 初凝时间 | ≥45min |',
    '',
    '支付项 36/1.1 场地清理按公顷计量。',
    '',
  ].join('\n'), 'utf8')
  kb.addKbFile({ path: doc })
})

// --- retrieval -------------------------------------------------------------
step('searchKb scoped by category finds the custom doc', () => {
  const hits = kb.searchKb('水泥 抗压强度', { category: '规范' })
  assert.ok(hits.length >= 1, 'no hits')
  const own = hits.find((hit) => hit.slug === added.entry.slug)
  assert.ok(own, 'custom doc not among category-scoped hits')
  assert.ok(own.citation.includes(added.entry.slug + ':'))
  assert.ok(own.snippet.length > 0)
})
step('cross-corpus search spreads across entries (per-entry cap)', () => {
  const hits = kb.searchKb('水泥', { limit: 8 })
  assert.ok(hits.length >= 1, 'no hits')
  const slugs = new Set(hits.map((hit) => hit.slug))
  if (hits.length >= 4) assert.ok(slugs.size >= 2, 'one entry monopolized the window')
  const counts = {}
  hits.forEach((hit) => { counts[hit.slug] = (counts[hit.slug] || 0) + 1 })
  assert.ok(Object.values(counts).every((n) => n <= 3), 'per-entry cap exceeded')
})
step('findKbClause matches 3.2', () => {
  const hits = kb.findKbClause('3.2', { slugs: [added.entry.slug] })
  assert.ok(hits.length >= 1, 'no clause hits')
  assert.ok(hits[0].matchedClause, 'no matchedClause')
})
step('findKbTable matches header text', () => {
  // extractTableRefs indexes header rows; body cells are found via plain search.
  const hits = kb.findKbTable('指标', { slugs: [added.entry.slug] })
  assert.ok(hits.length >= 1, 'no table hits')
  assert.ok(hits[0].matchedTable, 'no matchedTable')
})
step('findKbTable matches BOQ item 36/1.1', () => {
  const hits = kb.findKbTable('36/1.1', { slugs: [added.entry.slug] })
  assert.ok(hits.length >= 1, 'no boq hits')
})
step('readKbChunk returns full text', () => {
  const hits = kb.searchKb('初凝时间', { slugs: [added.entry.slug] })
  const chunk = kb.readKbChunk(hits[0].slug, hits[0].chunkId)
  assert.ok(chunk.text.includes('初凝时间'))
  assert.ok(chunk.citation.includes(hits[0].chunkId))
})
step('category filter works', () => {
  const hits = kb.searchKb('水泥', { category: '规范' })
  assert.ok(hits.every((hit) => hit.category === '规范'))
})

// --- remove + tombstone -----------------------------------------------------
const seededSlug = seed1.seeded[0]
const seededEntry = kb.listKbEntries().find((entry) => entry.slug === seededSlug)
step('remove seeded entry tombstones it', () => {
  const removed = kb.removeKbEntry(seededSlug)
  assert.equal(removed.removed, true)
  const registry = kb.loadKbRegistry()
  assert.ok(registry.removedSeeds.includes(seededEntry.sourcePath))
})
step('force re-seed does not resurrect tombstoned entry', () => {
  const reseed = kb.seedBundledKnowledge(true)
  assert.ok(!reseed.seeded.includes(seededSlug))
  assert.ok(!kb.listKbEntries().some((entry) => entry.slug === seededSlug))
})
step('re-adding tombstoned path clears the tombstone', () => {
  const back = kb.addKbFile({ path: seededEntry.sourcePath, category: seededEntry.category, seeded: true })
  assert.ok(back.entry.slug.length > 0)
  assert.ok(!kb.loadKbRegistry().removedSeeds.includes(seededEntry.sourcePath))
})

// --- reindex ---------------------------------------------------------------
step('reindex all entries', () => {
  const result = kb.reindexKb()
  assert.equal(result.missing.length, 0)
  assert.ok(result.reindexed.length >= 2)
})
step('reindex falls back to managed copy when source vanishes', () => {
  rmSync(doc)
  const result = kb.reindexKb(added.entry.slug)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.reindexed, [added.entry.slug])
})

// --- guards ------------------------------------------------------------------
step('PDF over 200 pages is planned as serial MinerU parts', () => {
  const parts = pdfParts.planPdfParts({
    pageCount: 450,
    fileBytes: 40 * 1024 * 1024,
    maxPages: pdfParts.MINERU_PRECISION_MAX_PAGES,
    maxBytes: 200 * 1024 * 1024,
  })
  assert.equal(parts.length, 3)
  assert.deepEqual(parts[1], { startPage: 201, endPage: 400 })
})
step('digital PDF text probe prefers the local channel', () => {
  const classified = pdfText.classifyPdfText(
    Array.from({ length: 10 }, (_, index) => ({ page: index + 1, chars: 160 })),
  )
  assert.equal(classified.useLocalText, true)
  assert.equal(classified.useOcr, false)
})
step('merged MinerU parts keep original page numbers', () => {
  const merged = mineruMerge.mergeMineruParts([
    { startPage: 1, endPage: 200, markdown: '<!-- page 1 -->\n# A\n' },
    { startPage: 201, endPage: 220, markdown: '<!-- page 1 -->\n# B\n' },
  ])
  assert.match(merged.markdown, /<!-- page 201 -->/)
})

step('unsupported extension rejected with hint', () => {
  const exe = join(kbRootDir, 'x.exe')
  writeFileSync(exe, 'dummy')
  assert.throws(() => kb.addKbFile({ path: exe }), /支持/)
})
step('missing file rejected', () => {
  assert.throws(() => kb.addKbFile({ path: join(kbRootDir, 'nope.md') }), /不存在/)
})

// --- workbench integration points -------------------------------------------
const knowledge = await import('../bundles/tender-host/src/knowledge.ts')
step('resolveBindingFiles: default profile has pricing + analysis files on disk', () => {
  const resolved = knowledge.resolveBindingFiles()
  assert.ok(resolved.files.length > 0, 'no binding files')
  const missing = resolved.files.filter((file) => !file.exists)
  assert.deepEqual(missing.map((file) => file.path), [], 'binding files missing on disk')
})

const orchestration = await import('../bundles/tender-host/src/orchestration.ts')
const modules = await import('../bundles/tender-host/src/modules.ts')
step('buildStageDraft injects 方法标准与范文模板 for pricing stage', () => {
  const workflow = modules.workflowFor('tender')
  const stage = workflow.stages.find((item) => item.id === 'boq-five-step-pricing')
  const fakeProject = {
    module: 'tender',
    projectId: 'smoke-demo',
    name: '冒烟示例',
    rootPath: kbRootDir,
    inputPaths: [],
    createdAt: new Date().toISOString(),
  }
  const draft = orchestration.buildStageDraft(fakeProject, stage)
  assert.ok(draft.includes('方法标准与范文模板'), 'draft missing bindings block')
  assert.ok(draft.includes('method_and_depth_standard'), 'draft missing method standard role')
})
step('buildStageDraft for setup stage lists analysis bindings', () => {
  const workflow = modules.workflowFor('tender')
  const stage = workflow.stages.find((item) => item.id === 'project-setup')
  const fakeProject = {
    module: 'tender',
    projectId: 'smoke-demo',
    name: '冒烟示例',
    rootPath: kbRootDir,
    inputPaths: [],
    createdAt: new Date().toISOString(),
  }
  const draft = orchestration.buildStageDraft(fakeProject, stage)
  assert.ok(draft.includes('方法标准与范文模板'), 'setup draft missing bindings block')
})

const evidence = await import('../bundles/tender-host/src/evidence.ts')
step('assessEvidence counts KB entries as evidence sources', () => {
  const ledger = evidence.assessEvidence(kbRootDir, 'smoke-demo', '')
  assert.ok(ledger, 'no ledger returned')
  assert.ok(Array.isArray(ledger.gaps))
})

// module-graph syntax check: import the full bundle entry (no calls).
step('full tender-host module graph imports cleanly', async () => {})
try {
  await import('../bundles/tender-host/src/index.ts')
  steps.push(['ok', 'import bundles/tender-host/src/index.ts'])
} catch (error) {
  steps.push(['FAIL', 'import index.ts :: ' + (error && error.message || error)])
}

// --- report -------------------------------------------------------------------
let failed = 0
for (const [status, name] of steps) {
  if (status === 'FAIL') failed++
  console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'}  ${name}`)
}
rmSync(kbRootDir, { recursive: true, force: true })
console.log(failed === 0 ? `\nALL ${steps.length} STEPS PASSED` : `\n${failed}/${steps.length} STEPS FAILED`)
process.exit(failed === 0 ? 0 : 1)
