import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { extractCitationTokens } from '../src/citations.ts'
import { addKbContent, findKbClause, kbOverview, readKbChunk, reindexKb } from '../src/kb.ts'
import { chunkByStructure, measureFidelity, normalizeClauseId } from '../src/kb-structure.ts'

const fixtureDir = dirname(fileURLToPath(import.meta.url))
const excerpt = readFileSync(join(fixtureDir, 'fixtures', 'coto-ch1-excerpt.md'), 'utf8')

test('normalizeClauseId folds spaced COTO numbers and clause prefixes', () => {
  assert.equal(normalizeClauseId('A1. 2.3.4'), 'A1.2.3.4')
  assert.equal(normalizeClauseId('clause A1.2.3'), 'A1.2.3')
  assert.equal(normalizeClauseId('  a1.2.3  '), 'A1.2.3')
  assert.equal(normalizeClauseId('A1.2.3.2 1'), 'A1.2.3.21')
})

test('chunkByStructure cuts COTO units at clause boundaries, not 3000-character windows', () => {
  const chunks = chunkByStructure(excerpt, 'COTO Chapter 1')
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]))

  assert.ok(byId.has('A1.2.1'))
  assert.ok(byId.has('A1.2.3'))
  assert.ok(byId.has('A1.2.3.4'))
  assert.ok(byId.has('A1.2.4.1'))
  assert.ok(byId.has('C1.1.3.2'))

  const general = byId.get('A1.2.3')
  assert.ok(general)
  assert.match(general.text, /The following Clauses include specifications/)
  assert.doesNotMatch(general.text, /A1\.2\.4 DESIGN/)
  assert.deepEqual(general.metadata.headingPath.slice(-2), [
    'PART A: SPECIFICATIONS',
    'A1.2.3 GENERAL',
  ])
  assert.ok(general.metadata.clauseRefs.includes('A1.2.3'))

  const rainfall = byId.get('A1.2.3.4')
  assert.ok(rainfall)
  assert.match(rainfall.text, /record rainfall daily/)
  assert.ok(rainfall.text.trim().endsWith('.'))
  assert.ok(rainfall.metadata.headingPath.includes('A1.2.3 GENERAL'))

  const tocHits = chunks.filter((chunk) => chunk.id === 'A1.2.3' && chunk.metadata.kind === 'toc')
  assert.equal(tocHits.length, 0)
})

test('chunkByStructure joins OCR-split two-digit clause suffixes and skips cross-ref rows', () => {
  const chunks = chunkByStructure(
    [
      'A1.2.3.2 1 Water',
      'The Contractor shall make his own arrangements for procuring water needed for construction.',
      'A1.2.3.2 2 Wayleaves',
      'The Employer will be responsible for obtaining the necessary planning approvals.',
      'A1.2.3.17 C1.3.1 of Chapter 1',
      'This line is a payment table row, not a new clause heading.',
    ].join('\n'),
    'COTO',
  )
  const ids = chunks.map((chunk) => chunk.id)
  assert.ok(ids.includes('A1.2.3.21'))
  assert.ok(ids.includes('A1.2.3.22'))
  assert.ok(!ids.includes('A1.2.3.2-2'))
  assert.ok(!ids.includes('A1.2.3.17'))
  assert.match(chunks.find((chunk) => chunk.id === 'A1.2.3.21')?.text ?? '', /procuring water/)
})

test('chunkByStructure keeps ATX markdown as heading units', () => {
  const chunks = chunkByStructure(
    [
      '# C5.1 路床处理',
      '',
      '引言。',
      '',
      '## C5.1.1 路床压实',
      '',
      '适用 Clause A5.1.3。压实度 95% MDD。',
      '',
      '## C5.1.3 开挖',
      '',
      '软土可直接挖除。',
    ].join('\n'),
    '范文',
  )
  const compaction = chunks.find((chunk) => chunk.id === 'C5.1.1' || chunk.metadata.clauseRefs.includes('C5.1.1'))
  assert.ok(compaction)
  assert.match(compaction.text, /95% MDD/)
  assert.doesNotMatch(compaction.text, /软土可直接挖除/)
  assert.ok(compaction.metadata.clauseRefs.includes('A5.1.3'))
  assert.ok(compaction.metadata.headingPath[0]?.includes('C5.1'))
})

test('addKbContent + findKbClause hits the body clause, not the table of contents', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-struct-'))
  process.env.AGENT_PI_KB_ROOT = root
  const src = join(root, 'coto-excerpt.md')
  writeFileSync(src, excerpt)
  const added = addKbContent({ fileName: 'coto-excerpt.md', text: excerpt, name: 'COTO excerpt', category: '规范', slug: 'coto-excerpt' })
  assert.ok(added.chunkCount < 20)
  assert.ok(added.chunkCount >= 5)

  const hits = findKbClause('A1.2.3', { slugs: ['coto-excerpt'] })
  assert.ok(hits.length > 0)
  assert.equal(hits[0]?.chunkId, 'A1.2.3')
  assert.doesNotMatch(hits[0]?.snippet ?? '', /TABLE OF CONTENTS/)
  const text = readKbChunk('coto-excerpt', 'A1.2.3')
  assert.match(text.text, /not included in any of the other specific Chapters/)
  assert.doesNotMatch(text.text, /A1\.2\.4 DESIGN/)

  const payment = findKbClause('C1.1.3.2', { slugs: ['coto-excerpt'] })
  assert.equal(payment[0]?.chunkId, 'C1.1.3.2')

  const children = findKbClause('A1.2.3', { slugs: ['coto-excerpt'] })
  assert.ok(children.some((hit) => hit.chunkId === 'A1.2.3.4'))
  assert.ok(!children.some((hit) => hit.chunkId === 'A1.2.4.1'))
})

test('structured units keep manuscript offsets so a slice equals the unit text', () => {
  const units = chunkByStructure(excerpt, 'COTO Chapter 1')
  const general = units.find((unit) => unit.id === 'A1.2.3')
  assert.ok(general)
  assert.ok(Number.isInteger(general.startOffset))
  assert.ok(general.endOffset > general.startOffset)
  assert.equal(excerpt.replace(/\r\n/g, '\n').slice(general.startOffset, general.endOffset).trim(), general.text.trim())
})

test('measureFidelity treats clause bodies as claimed and TOC as not claimable', () => {
  const units = chunkByStructure(excerpt, 'COTO Chapter 1')
  const fidelity = measureFidelity(excerpt, units)
  assert.ok(fidelity.coverage >= 0.85)
  assert.equal(fidelity.tocUnits, 0)
  assert.equal(fidelity.hardCuts, 0)
  assert.ok(fidelity.clauseCount >= 5)
  assert.ok(fidelity.completeUnits >= 5)
  assert.deepEqual(fidelity.collisions, [])
})

test('persisted index stores spans and textNorm, not a second copy of the manuscript', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-fid-'))
  process.env.AGENT_PI_KB_ROOT = root
  addKbContent({ fileName: 'coto-excerpt.md', text: excerpt, name: 'COTO excerpt', category: '规范', slug: 'coto-span' })
  const manifestPath = join(root, 'index', 'coto-span.json')
  const fidelityPath = join(root, 'index', 'coto-span.fidelity.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { chunks: Array<{ id: string, text?: string, textNorm?: string, startOffset?: number }> }
  const stored = manifest.chunks.find((chunk) => chunk.id === 'A1.2.3')
  assert.ok(stored)
  assert.equal(stored.text, undefined)
  assert.ok(stored.textNorm && stored.textNorm.includes('following clauses'))
  assert.ok((stored.startOffset ?? -1) >= 0)
  assert.equal(existsSync(fidelityPath), true)

  const read = readKbChunk('coto-span', 'A1.2.3')
  assert.match(read.text, /not included in any of the other specific Chapters/)
  assert.doesNotMatch(read.text, /A1\.2\.4 DESIGN/)

  const overview = kbOverview().entries.find((entry) => entry.slug === 'coto-span')
  assert.ok(overview)
  assert.ok((overview.clauseCount ?? 0) >= 5)
  assert.ok((overview.coverage ?? 0) >= 0.85)
})

test('reindexKb rebuilds spans even when the manuscript hash is unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-reindex-'))
  process.env.AGENT_PI_KB_ROOT = root
  addKbContent({ fileName: 'coto-excerpt.md', text: excerpt, name: 'COTO excerpt', category: '规范', slug: 'coto-reindex' })
  writeFileSync(join(root, 'index', 'coto-reindex.fidelity.json'), JSON.stringify({ schemaVersion: 1, coverage: 0 }) + '\n')
  const again = reindexKb('coto-reindex')
  assert.deepEqual(again.reindexed, ['coto-reindex'])
  const fidelity = JSON.parse(readFileSync(join(root, 'index', 'coto-reindex.fidelity.json'), 'utf8')) as { coverage: number }
  assert.ok(fidelity.coverage >= 0.85)
})

test('chunkByStructure cuts Chinese 章/节/条 and numbered 中文 titles', () => {
  const text = [
    '第1章 总则',
    '本章规定混凝土结构的基本要求。',
    '第1.1节 适用范围',
    '本规范适用于房屋和一般构筑物。',
    '第1.1.1条 材料',
    '混凝土强度等级不应低于 C25。',
    '1.2 一般规定',
    '施工缝应设置在受力较小处。',
  ].join('\n')
  const chunks = chunkByStructure(text, 'GB 50010')
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]))
  assert.ok(byId.has('1'))
  assert.ok(byId.has('1.1'))
  assert.ok(byId.has('1.1.1'))
  assert.ok(byId.has('1.2'))
  assert.match(byId.get('1.1.1')?.text ?? '', /C25/)
  assert.doesNotMatch(byId.get('1.1.1')?.text ?? '', /施工缝/)
  assert.match(byId.get('1.2')?.text ?? '', /施工缝/)
  assert.equal(normalizeClauseId('第1.1.1条'), '1.1.1')
})

test('chunkByStructure cuts FIDIC-style Clause headings', () => {
  const text = [
    'Clause 8.4 Extension of Time for Completion',
    'The Contractor shall be entitled to an extension of time.',
    'Clause 8.5 Delays Caused by Authorities',
    'If the following conditions apply, the Contractor shall give notice.',
  ].join('\n')
  const chunks = chunkByStructure(text, 'FIDIC Red')
  const ext = chunks.find((chunk) => chunk.id === '8.4')
  const delay = chunks.find((chunk) => chunk.id === '8.5')
  assert.ok(ext)
  assert.ok(delay)
  assert.match(ext.text, /entitled to an extension/)
  assert.doesNotMatch(ext.text, /Delays Caused/)
  assert.equal(normalizeClauseId('Clause 8.4'), '8.4')
})

test('citation tokens accept dotted clause ids', () => {
  const tokens = extractCitationTokens('The rainfall rule applies [kb:coto-excerpt:A1.2.3].')
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0]?.slug, 'coto-excerpt')
  assert.equal(tokens[0]?.chunkId, 'A1.2.3')
})
