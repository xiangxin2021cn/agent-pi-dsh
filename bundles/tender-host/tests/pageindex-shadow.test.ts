import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildPageIndexTree,
  createPageIndexShadow,
  pageIndexShadowEligibility,
  readPageIndexShadow,
  searchPageIndexShadow,
} from '../src/pageindex-shadow.ts'

function longNarrative(): string {
  return [
    '# Tender Data',
    '<!-- page 1 -->',
    'General conditions and submission instructions. '.repeat(130),
    '## Qualification',
    '<!-- page 8 -->',
    'The bidder shall provide audited financial statements. '.repeat(100),
    '### Insurance',
    '<!-- page 11 -->',
    'Professional indemnity insurance is mandatory. '.repeat(100),
    '```',
    '# not a heading',
    '```',
    '## Payment',
    '<!-- page 14 -->',
    'Interim payment certificates are due monthly. '.repeat(100),
  ].join('\n')
}

test('builds a stable PageIndex-compatible hierarchy and ignores fenced headings', () => {
  const nodes = buildPageIndexTree(longNarrative())
  assert.equal(nodes[0]?.title, 'Tender Data')
  assert.equal(nodes[0]?.nodeId, '0001')
  assert.equal(nodes[0]?.nodes?.[0]?.title, 'Qualification')
  assert.equal(nodes[0]?.nodes?.[0]?.nodes?.[0]?.title, 'Insurance')
  assert.equal(nodes.flatMap((node) => JSON.stringify(node)).some((text) => text.includes('not a heading')), false)
})

test('only long narrative documents are eligible; spreadsheets and table-heavy files are not', () => {
  assert.equal(pageIndexShadowEligibility(longNarrative(), 'Volume 3.pdf').eligible, true)
  assert.equal(pageIndexShadowEligibility(longNarrative(), 'BOQ.xlsx').eligible, false)
  assert.equal(pageIndexShadowEligibility('# Short\nsmall', 'brief.md').eligible, false)
  const table = '# BOQ\n' + '| Item | Qty |\n|---|---|\n| A | 1 |\n'.repeat(100)
  assert.equal(pageIndexShadowEligibility(table, 'schedule.md').eligible, false)
})

test('writes an auditable shadow sidecar and detects manuscript or pack changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-pageindex-'))
  const manuscript = join(dir, 'manuscript.md')
  const pack = join(dir, 'pack.json')
  writeFileSync(manuscript, longNarrative())
  writeFileSync(pack, '{"schemaVersion":1}\n')
  const status = createPageIndexShadow({ manuscriptPath: manuscript, originalPath: 'Volume 3.pdf', packPath: pack, sourceId: 'volume-3' })
  assert.equal(status.state, 'ready')
  assert.equal(status.tree?.mode, 'shadow')
  assert.equal(status.tree?.model, null)
  assert.equal(status.tree?.parser.upstreamLicense, 'MIT')
  assert.equal(readPageIndexShadow({ manuscriptPath: manuscript, packPath: pack }).state, 'ready')
  const hit = searchPageIndexShadow(status.tree!, 'insurance', 4)[0]
  assert.equal(hit?.title, 'Insurance')
  assert.equal(hit?.pageStart, 11)

  writeFileSync(manuscript, `${readFileSync(manuscript, 'utf8')}\nchanged`)
  assert.equal(readPageIndexShadow({ manuscriptPath: manuscript, packPath: pack }).state, 'stale')
})
