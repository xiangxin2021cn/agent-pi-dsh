import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addKbFile, findKbClause, importKbPack, readKbChunk, stageKbFile } from '../src/kb.ts'
import { looksLikeKbPack } from '../src/kb-pack.ts'

function writePack(dir: string, manuscript: string, pack: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manuscript.md'), manuscript)
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'agent-pi-kb-pack',
    ...pack,
  }) + '\n')
}

test('looksLikeKbPack accepts a folder, pack.json, or manuscript beside pack.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-pack-look-'))
  const dir = join(root, 'demo-知识包')
  writePack(dir, '# 1.1 总则\n\n适用房屋。\n', { name: 'demo' })
  assert.equal(looksLikeKbPack(dir), true)
  assert.equal(looksLikeKbPack(join(dir, 'pack.json')), true)
  assert.equal(looksLikeKbPack(join(dir, 'manuscript.md')), true)
  assert.equal(looksLikeKbPack(root), false)
})

test('importKbPack uses pack units when offsets match the manuscript', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-pack-units-'))
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  const manuscript = [
    '第1.1条 材料',
    '混凝土强度等级不应低于 C25。',
    '第1.2条 施工缝',
    '施工缝应设置在受力较小处。',
  ].join('\n')
  const firstEnd = manuscript.indexOf('第1.2条')
  const dir = join(root, 'gb-知识包')
  writePack(dir, manuscript, {
    name: 'GB 50010 摘录',
    category: '规范',
    units: [
      { id: '1.1', title: '第1.1条 材料', startOffset: 0, endOffset: firstEnd, kind: 'clause' },
      { id: '1.2', title: '第1.2条 施工缝', startOffset: firstEnd, endOffset: manuscript.length, kind: 'clause' },
    ],
  })
  const added = importKbPack({ path: dir, slug: 'gb-pack' })
  assert.equal(added.entry.parseStatus, 'ready')
  assert.equal(added.entry.ingest, 'pack')
  assert.equal(added.chunkCount, 2)
  const material = findKbClause('1.1', { slugs: ['gb-pack'] })
  assert.equal(material[0]?.chunkId, '1.1')
  const text = readKbChunk('gb-pack', '1.1')
  assert.match(text.text, /C25/)
  assert.doesNotMatch(text.text, /施工缝/)
})

test('importKbPack falls back to heading cut when unit offsets are invalid', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-pack-fallback-'))
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  const manuscript = [
    'Clause 8.4 Extension of Time',
    'The Contractor shall be entitled to an extension of time.',
    'Clause 8.5 Delays Caused by Authorities',
    'The Contractor shall give notice.',
  ].join('\n')
  const dir = join(root, 'fidic-kb-pack')
  writePack(dir, manuscript, {
    name: 'FIDIC excerpt',
    units: [{ id: 'bad', title: 'broken', startOffset: 0, endOffset: 99999 }],
  })
  const added = addKbFile({ path: dir, slug: 'fidic-pack' })
  assert.equal(added.entry.parseStatus, 'ready')
  assert.ok(findKbClause('8.4', { slugs: ['fidic-pack'] }).some((hit) => hit.chunkId === '8.4'))
  assert.match(readKbChunk('fidic-pack', '8.4').text, /entitled to an extension/)
})

test('stageKbFile of a pack folder is ready immediately, not staged', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-pack-stage-'))
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  const dir = join(root, 'note-知识包')
  writePack(dir, '# 2.1 压实\n\n压实度 95% MDD。\n', { name: '压实摘录' })
  const staged = stageKbFile({ path: join(dir, 'pack.json'), category: '规范' })
  assert.equal(staged.entry.parseStatus, 'ready')
  assert.equal(staged.staged, undefined)
  assert.equal(staged.entry.ingest, 'pack')
})
