import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { describeCitation } from '../src/citations.ts'
import { addKbContent, findKbTable, kbOverview, readKbChunk, reindexKb } from '../src/kb.ts'

const fixtureDir = dirname(fileURLToPath(import.meta.url))
const excerpt = readFileSync(join(fixtureDir, 'fixtures', 'coto-ch1-excerpt.md'), 'utf8')

const htmlTableDoc = [
  'A1.2.8 WORKMANSHIP',
  '',
  'The Contractor shall keep rainfall records on Site.',
  '',
  'Table C1.2.8-1 Payment items',
  '<table><tr><td>Item</td><td>Description</td><td>Unit</td></tr><tr><td>C1.2.8</td><td>Rainfall delay</td><td>day</td></tr></table>',
  '',
  'A1.2.9 OTHER',
  '',
  'This clause is after the payment table and must not swallow the table body.',
].join('\n')

const tableList = [
  { type: 'title', text: 'A1.2.8 WORKMANSHIP', page_idx: 19 },
  {
    type: 'table',
    table_caption: ['Table C1.2.8-1 Payment items'],
    html: '<table><tr><td>Item</td><td>Description</td><td>Unit</td></tr><tr><td>C1.2.8</td><td>Rainfall delay</td><td>day</td></tr></table>',
    page_idx: 19,
  },
  { type: 'title', text: 'A1.2.9 OTHER', page_idx: 20 },
]

test('manuscript page markers attach to the clause even when the comment sits before the heading', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-page-'))
  process.env.AGENT_PI_KB_ROOT = root
  addKbContent({ fileName: 'coto-excerpt.md', text: excerpt, name: 'COTO excerpt', category: '规范', slug: 'coto-page' })
  const read = readKbChunk('coto-page', 'A1.2.3')
  assert.equal(read.pageStart, 13)
  assert.match(read.citation, /p\.13/)
  const loc = describeCitation(root, null, '[kb:coto-page:A1.2.3]')
  assert.equal(loc.exists, true)
  assert.equal(loc.page, 13)
  assert.equal(loc.clause, 'A1.2.3')
})

test('content_list titles supply a page when the manuscript has no page comments', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-title-page-'))
  process.env.AGENT_PI_KB_ROOT = root
  const text = [
    'A1.2.3 GENERAL',
    'The following Clauses include specifications for various general items which are not included in any of the other specific Chapters.',
    'A1.2.4 DESIGN BY CONTRACTOR',
    'The Contractor shall submit designs and drawings before construction.',
  ].join('\n')
  addKbContent({
    fileName: 'plain.md',
    text,
    name: 'Plain COTO',
    category: '规范',
    slug: 'plain-coto',
    contentList: [
      { type: 'title', text: 'A1.2.3 GENERAL', page_idx: 12 },
      { type: 'title', text: 'A1.2.4 DESIGN BY CONTRACTOR', page_idx: 13 },
    ],
  })
  assert.equal(readKbChunk('plain-coto', 'A1.2.3').pageStart, 13)
  assert.equal(readKbChunk('plain-coto', 'A1.2.4').pageStart, 14)
  assert.equal(existsSync(join(root, 'files', 'plain-coto.content_list.json')), true)
})

test('content_list tables become whole units and stay out of the next clause', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-table-'))
  process.env.AGENT_PI_KB_ROOT = root
  addKbContent({
    fileName: 'pay.md',
    text: htmlTableDoc,
    name: 'Payment table',
    category: '规范',
    slug: 'pay-table',
    contentList: tableList,
  })
  const table = readKbChunk('pay-table', 'table-C1.2.8-1')
  assert.match(table.text, /Table C1\.2\.8-1 Payment items/)
  assert.match(table.text, /Rainfall delay/)
  assert.doesNotMatch(table.text, /must not swallow/)
  assert.equal(table.pageStart, 20)
  const next = readKbChunk('pay-table', 'A1.2.9')
  assert.doesNotMatch(next.text, /Rainfall delay/)
  const hits = findKbTable('Payment items', { slugs: ['pay-table'] })
  assert.equal(hits[0]?.chunkId, 'table-C1.2.8-1')
  const overview = kbOverview().entries.find((entry) => entry.slug === 'pay-table')
  assert.ok((overview?.tableCount ?? 0) >= 1)
})

test('reindexKb reapplies a stored content_list without a second parse', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-list-reindex-'))
  process.env.AGENT_PI_KB_ROOT = root
  addKbContent({
    fileName: 'pay.md',
    text: htmlTableDoc,
    name: 'Payment table',
    category: '规范',
    slug: 'pay-reindex',
    contentList: tableList,
  })
  writeFileSync(join(root, 'index', 'pay-reindex.fidelity.json'), JSON.stringify({ schemaVersion: 1, coverage: 0, tableCount: 0 }) + '\n')
  const again = reindexKb('pay-reindex')
  assert.deepEqual(again.reindexed, ['pay-reindex'])
  assert.equal(readKbChunk('pay-reindex', 'table-C1.2.8-1').pageStart, 20)
})
