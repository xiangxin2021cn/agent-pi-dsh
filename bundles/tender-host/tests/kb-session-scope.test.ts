import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addKbContent, findKbClause, findKbTable, formatSelectedKbContext, getKbTaskSlugs, listKbEntries, searchKb, setKbTaskSlugs } from '../src/kb.ts'
import { registerTools } from '../src/tools.ts'

test('new conversations have no implicit KB scope and explicit selections remain isolated', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-session-scope-'))
  const previous = process.env.AGENT_PI_KB_ROOT
  process.env.AGENT_PI_KB_ROOT = root
  try {
    const manuscript = readFileSync(new URL('./fixtures/coto-ch1-excerpt.md', import.meta.url), 'utf8')
      + '\n\n# Table 51.02 Rainfall records\n\n| Item | Rainfall |\n| --- | --- |\n| 51.02 | Daily rainfall record |\n'
    for (const slug of ['entry-a', 'entry-b']) addKbContent({ fileName: `${slug}.md`, name: slug, slug, text: manuscript + `\n${slug}`, category: '规范' })
    const selectionPath = join(root, 'task-selection.json')
    writeFileSync(selectionPath, JSON.stringify({ schemaVersion: 1, bySession: { active: ['entry-b'], 'old-session': ['entry-b'] } }))
    const originalSelection = readFileSync(selectionPath, 'utf8')
    const originalIndex = readFileSync(join(root, 'index/entry-b.json'), 'utf8')
    assert.deepEqual(getKbTaskSlugs(), [])
    assert.deepEqual(getKbTaskSlugs('active'), [])
    assert.deepEqual(getKbTaskSlugs('new-session'), [])
    assert.equal(formatSelectedKbContext(), '')
    assert.equal(formatSelectedKbContext('new-session'), '')
    assert.deepEqual(setKbTaskSlugs(undefined, ['entry-a']), [])
    assert.equal(readFileSync(selectionPath, 'utf8'), originalSelection)

    const definitions: Array<{ name?: string; execute?: (...args: any[]) => unknown }> = []
    registerTools({ tools: { register: (definition) => { definitions.push(definition as never); return definition } } }, (definition) => definition)
    const call = async (name: string, args: Record<string, unknown>, sessionId?: string) => {
      const tool = definitions.find((definition) => definition.name === name)
      assert.ok(tool?.execute)
      return JSON.parse(await tool.execute(args, { agent: { session: { id: sessionId } } }) as string)
    }
    const searches = [
      ['kb_search', { query: 'rainfall' }],
      ['kb_find_clause', { value: 'A1.2.3.4' }],
      ['kb_find_table', { value: '51.02' }],
    ] as const
    for (const [name, args] of searches) {
      for (const sessionId of [undefined, 'new-session']) {
        const result = await call(name, args, sessionId)
        assert.deepEqual(name === 'kb_search' ? result.hits : result, [])
      }
    }
    assert.equal(listKbEntries().length, 2, 'an unselected model query must not seed the whole bundled library')
    assert.deepEqual(searchKb('rainfall', { slugs: [] }), [])
    assert.deepEqual(findKbClause('A1.2.3.4', { slugs: [] }), [])
    assert.deepEqual(findKbTable('51.02', { slugs: [] }), [])

    setKbTaskSlugs('new-session', ['entry-a'])
    for (const [name, args] of searches) {
      const result = await call(name, args, 'new-session')
      const hits = name === 'kb_search' ? result.hits : result
      assert.ok(hits.length > 0, name)
      assert.ok(hits.every((hit: { slug: string }) => hit.slug === 'entry-a'), name)
      const explicit = await call(name, { ...args, slugs: ['entry-b'] }, 'new-session')
      const explicitHits = name === 'kb_search' ? explicit.hits : explicit
      assert.ok(explicitHits.length > 0, `${name}: explicit project/user scope remains usable`)
      assert.ok(explicitHits.every((hit: { slug: string }) => hit.slug === 'entry-b'))
      const empty = await call(name, { ...args, slugs: [] }, 'new-session')
      assert.deepEqual(name === 'kb_search' ? empty.hits : empty, [])
    }
    assert.deepEqual(getKbTaskSlugs('new-session'), ['entry-a'])
    assert.deepEqual(getKbTaskSlugs('old-session'), ['entry-b'])
    assert.match(formatSelectedKbContext('new-session'), /entry-a/)
    assert.doesNotMatch(formatSelectedKbContext('new-session'), /entry-b/)
    assert.equal(readFileSync(join(root, 'index/entry-b.json'), 'utf8'), originalIndex)
    setKbTaskSlugs('new-session', [])
    assert.equal(formatSelectedKbContext('new-session'), '')
    assert.deepEqual((await call('kb_search', { query: 'rainfall' }, 'new-session')).hits, [])
  } finally {
    if (previous === undefined) delete process.env.AGENT_PI_KB_ROOT
    else process.env.AGENT_PI_KB_ROOT = previous
    rmSync(root, { recursive: true, force: true })
  }
})
