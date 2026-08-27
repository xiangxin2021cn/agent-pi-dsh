import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addKbContent, importKbPack, listKbEntries, readKbChunk, saveKbMarkdown, searchKb, syncKbFromMarkdownSave } from '../src/kb.ts'
import { saveWorkspaceText } from '../src/preview-export.ts'

function seedDirect(slug: string): string {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-save-'))
  process.env.AGENT_PI_KB_ROOT = root
  addKbContent({
    fileName: `${slug}.md`,
    text: [
      '# 1.1 Cement',
      '',
      'Cement shall be OPC 52.5R from Plant A only.',
      '',
    ].join('\n'),
    name: 'Materials excerpt',
    category: '规范',
    slug,
  })
  return root
}

test('saveKbMarkdown rebuilds chunk JSON, MiniSearch, and retrieval', () => {
  const root = seedDirect('coto-edit')
  assert.ok(searchKb('Plant A', { slugs: ['coto-edit'] }).some((hit) => /Plant A/.test(hit.snippet)))
  assert.equal(searchKb('ZXQ-9911', { slugs: ['coto-edit'] }).length, 0)

  const saved = saveKbMarkdown('coto-edit', [
    '# 1.1 Cement',
    '',
    'Use ZXQ-9911 binder only.',
    '',
    '# 1.2 Water',
    '',
    'Mixing water shall be potable.',
    '',
  ].join('\n'))
  assert.equal(saved.replaced, true)
  assert.ok(saved.chunkCount >= 2)
  assert.equal(saved.entry.chunkCount, saved.chunkCount)

  const manifest = JSON.parse(readFileSync(join(root, 'index', 'coto-edit.json'), 'utf8')) as {
    chunks: Array<{ title?: string; startOffset: number; endOffset: number }>
  }
  assert.ok(manifest.chunks.some((chunk) => /Water/.test(String(chunk.title || ''))))
  assert.equal(existsSync(join(root, 'index', 'coto-edit.minisearch.json')), true)
  assert.ok(existsSync(join(root, 'index', 'coto-edit.fidelity.json')))

  const binder = searchKb('ZXQ-9911', { slugs: ['coto-edit'] })
  assert.ok(binder.length > 0)
  assert.match(binder[0]?.snippet ?? '', /ZXQ-9911/)
  const water = searchKb('potable', { slugs: ['coto-edit'] })
  assert.ok(water.length > 0)
  assert.match(readKbChunk('coto-edit', water[0]!.chunkId).text, /potable/)
  assert.equal(searchKb('Plant A', { slugs: ['coto-edit'] }).length, 0)
})

test('saveKbMarkdown writes pack.json units and manuscript back to the imported pack', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-save-pack-'))
  process.env.AGENT_PI_KB_ROOT = root
  const packDir = join(root, 'workspace', 'GB-知识包')
  mkdirSync(packDir, { recursive: true })
  const manuscript = [
    '第1.1条 材料',
    '混凝土强度等级不应低于 C25。',
    '',
  ].join('\n')
  writeFileSync(join(packDir, 'manuscript.md'), manuscript)
  writeFileSync(join(packDir, 'pack.json'), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'agent-pi-kb-pack',
    name: 'GB 摘录',
    category: '规范',
    manuscript: 'manuscript.md',
    units: [{ id: '1.1', title: '第1.1条 材料', startOffset: 0, endOffset: manuscript.length, kind: 'clause' }],
  }, null, 2)}\n`)
  const added = importKbPack({ path: packDir, slug: 'gb-pack' })
  assert.equal(added.entry.ingest, 'pack')

  const saved = saveKbMarkdown('gb-pack', [
    '第1.1条 材料',
    '混凝土强度等级不应低于 C30。',
    '第1.2条 养护',
    '湿养护不得少于 7 天。',
    '',
  ].join('\n'))
  assert.equal(saved.packPath, join(packDir, 'pack.json'))
  const pack = JSON.parse(readFileSync(join(packDir, 'pack.json'), 'utf8')) as {
    manuscript: string
    role?: string
    units: Array<{ title?: string }>
  }
  assert.equal(pack.manuscript, 'manuscript.md')
  assert.notEqual(pack.role, 'agent-pi-setup-restore')
  assert.ok(pack.units.some((unit) => /养护/.test(String(unit.title || ''))))
  assert.match(readFileSync(join(packDir, 'manuscript.md'), 'utf8'), /C30/)
  assert.ok(searchKb('湿养护', { slugs: ['gb-pack'] }).length > 0)
})

test('files-rail save of an imported pack manuscript also rebuilds KB search', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-kb-save-rail-'))
  process.env.AGENT_PI_KB_ROOT = join(cwd, 'kb')
  const packDir = join(cwd, 'COTO-知识包')
  mkdirSync(packDir, { recursive: true })
  writeFileSync(join(packDir, 'manuscript.md'), '# 8.4 Time\n\nThe Contractor shall be entitled to an extension of time.\n')
  writeFileSync(join(packDir, 'pack.json'), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'agent-pi-kb-pack',
    name: 'FIDIC excerpt',
    manuscript: 'manuscript.md',
  }, null, 2)}\n`)
  importKbPack({ path: packDir, slug: 'fidic-rail' })
  assert.equal(searchKb('liquidated damages', { slugs: ['fidic-rail'] }).length, 0)

  const saved = saveWorkspaceText(cwd, join(packDir, 'manuscript.md'), [
    '# 8.4 Time',
    '',
    'The Contractor shall be entitled to an extension of time.',
    '',
    '# 8.7 Damages',
    '',
    'Liquidated damages apply after the Time for Completion.',
    '',
  ].join('\n'))
  assert.equal(saved.kbSidecar, 'fidic-rail')
  assert.equal(saved.packSidecar, join(packDir, 'pack.json'))
  const hits = searchKb('liquidated damages', { slugs: ['fidic-rail'] })
  assert.ok(hits.length > 0)
  assert.match(hits[0]?.snippet ?? '', /Liquidated damages/)
  assert.ok((listKbEntries().find((entry) => entry.slug === 'fidic-rail')?.chunkCount ?? 0) >= 2)
  assert.equal(syncKbFromMarkdownSave(join(cwd, 'unrelated.md'), 'x'), null)
})
