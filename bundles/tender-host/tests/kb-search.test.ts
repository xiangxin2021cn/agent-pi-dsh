import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { addKbContent, findKbClause, searchKb } from '../src/kb.ts'
import { KB_SEARCH_BOOST, KB_SEARCH_ENGINE } from '../src/kb-search.ts'

const fixtureDir = dirname(fileURLToPath(import.meta.url))
const excerpt = readFileSync(join(fixtureDir, 'fixtures', 'coto-ch1-excerpt.md'), 'utf8')

const CROSS_REF = `

A1.2.5 CROSS REFERENCE
See A1.2.3.4 for the rainfall delay rule. Repeat A1.2.3.4. Again A1.2.3.4.
`

function seedExcerpt(slug: string, extra = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-search-'))
  process.env.AGENT_PI_KB_ROOT = root
  addKbContent({
    fileName: `${slug}.md`,
    text: excerpt + extra,
    name: 'COTO excerpt',
    category: '规范',
    slug,
  })
  return root
}

test('commit writes a MiniSearch sidecar without a second manuscript copy', () => {
  const root = seedExcerpt('coto-lexicon')
  const path = join(root, 'index', 'coto-lexicon.minisearch.json')
  assert.equal(existsSync(path), true)
  const stored = JSON.parse(readFileSync(path, 'utf8')) as {
    engine?: string
    boost?: Record<string, number>
    index?: { storedFields?: Record<string, { body?: string, text?: string }> }
  }
  assert.equal(stored.engine, KB_SEARCH_ENGINE)
  assert.deepEqual(stored.boost, { ...KB_SEARCH_BOOST })
  const fields = Object.values(stored.index?.storedFields ?? {})
  assert.ok(fields.length > 0)
  for (const row of fields) {
    assert.equal(row.body, undefined)
    assert.equal(row.text, undefined)
  }
})

test('searchKb ranks the rainfall clause and returns a complete-sentence snippet', () => {
  seedExcerpt('coto-rain')
  const hits = searchKb('rainfall', { slugs: ['coto-rain'], limit: 8 })
  assert.ok(hits.length > 0)
  assert.equal(hits[0]?.chunkId, 'A1.2.3.4')
  assert.match(hits[0]?.snippet ?? '', /record rainfall daily on Site/)
  assert.doesNotMatch(hits[0]?.snippet ?? '', /A1\.2\.4 DESIGN/)
  assert.ok((hits[0]?.score ?? 0) > 0)
})

test('searchKb prefix query still lands on the rainfall clause', () => {
  seedExcerpt('coto-prefix')
  const hits = searchKb('rain', { slugs: ['coto-prefix'], limit: 8 })
  assert.equal(hits[0]?.chunkId, 'A1.2.3.4')
})

test('searchKb skips TOC units even when they mention the same heading words', () => {
  seedExcerpt('coto-toc')
  const hits = searchKb('CONTENTS', { slugs: ['coto-toc'], limit: 20 })
  assert.ok(hits.every((hit) => !/table of contents/i.test(hit.title)))
  assert.ok(hits.every((hit) => hit.chunkId !== 'toc' && !hit.headingPath.some((part) => /^CONTENTS$/i.test(part))))
})

test('searchKb boosts the owning clause id above a body-only cross reference', () => {
  seedExcerpt('coto-boost', CROSS_REF)
  const hits = searchKb('A1.2.3.4', { slugs: ['coto-boost'], limit: 8 })
  assert.ok(hits.length >= 1)
  assert.equal(hits[0]?.chunkId, 'A1.2.3.4')
  const cross = hits.find((hit) => hit.chunkId === 'A1.2.5')
  assert.ok(cross)
  assert.ok((hits[0]?.score ?? 0) > (cross.score ?? 0))
})

test('searchKb still works after the sidecar is removed (rebuild from spans)', () => {
  const root = seedExcerpt('coto-rebuild')
  rmSync(join(root, 'index', 'coto-rebuild.minisearch.json'), { force: true })
  const hits = searchKb('rainfall records', { slugs: ['coto-rebuild'], limit: 4 })
  assert.equal(hits[0]?.chunkId, 'A1.2.3.4')
})

test('findKbClause stays on structure relations and does not need MiniSearch', () => {
  seedExcerpt('coto-clause')
  const exact = findKbClause('A1.2.3', { slugs: ['coto-clause'] })
  assert.equal(exact[0]?.chunkId, 'A1.2.3')
  assert.equal(exact[0]?.matchedClause, 'A1.2.3')
  const children = findKbClause('A1.2.3', { slugs: ['coto-clause'], limit: 8 })
  assert.ok(children.some((hit) => hit.chunkId === 'A1.2.3.4'))
})
