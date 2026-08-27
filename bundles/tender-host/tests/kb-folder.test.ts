import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { groupKbEntries, suggestKbFolderName } from '../src/kb-folder.ts'
import {
  addKbFile,
  createKbFolder,
  kbOverview,
  moveKbEntry,
  removeKbFolder,
  stageKbFile,
} from '../src/kb.ts'

test('suggestKbFolderName maps SANRAL COTO chapter PDFs to COTO 2020', () => {
  assert.equal(suggestKbFolderName('CHAPTER 1-GENERAL - DS VERSION OCT 2020.pdf'), 'COTO 2020')
  assert.equal(suggestKbFolderName('CHAPTER 2-SERVICES - DS VERSION OCT 2020.pdf'), 'COTO 2020')
  assert.equal(suggestKbFolderName('COTO 2020 Volume 3.pdf'), 'COTO 2020')
  assert.equal(suggestKbFolderName('COLTO 1998.pdf'), 'COLTO 1998')
  assert.equal(suggestKbFolderName('FIDIC Red Book 2017.pdf'), 'FIDIC 2017')
  assert.equal(suggestKbFolderName('施工组织设计.md'), '')
})

test('groupKbEntries nests files under a category folder and keeps leftovers loose', () => {
  const folders = [{ id: 'coto-2020', name: 'COTO 2020', category: '规范', createdAt: 't' }]
  const grouped = groupKbEntries([
    { slug: 'ch1', category: '规范', folderId: 'coto-2020' },
    { slug: 'note', category: '规范' },
    { slug: 'other', category: '合同', folderId: 'coto-2020' },
  ], folders, '规范')
  assert.equal(grouped.folders[0]?.folder.name, 'COTO 2020')
  assert.deepEqual(grouped.folders[0]?.entries.map((entry) => entry.slug), ['ch1'])
  assert.deepEqual(grouped.loose.map((entry) => entry.slug), ['note'])
})

test('staging a COTO chapter creates the COTO 2020 folder and existing files backfill', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-folder-'))
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  const pdf = join(root, 'CHAPTER 1-GENERAL - DS VERSION OCT 2020.pdf')
  writeFileSync(pdf, '%PDF-1.4')
  const staged = stageKbFile({ path: pdf, category: '规范' })
  assert.equal(staged.entry.category, '规范')
  assert.ok(staged.entry.folderId)
  const overview = kbOverview()
  assert.equal(overview.folders.some((folder) => folder.name === 'COTO 2020' && folder.category === '规范'), true)
  assert.equal(overview.entries[0]?.folderId, staged.entry.folderId)

  const created = createKbFolder('规范', 'SANS 1200')
  assert.equal(created.name, 'SANS 1200')
  const moved = moveKbEntry(staged.entry.slug, created.id)
  assert.equal(moved.entry.folderId, created.id)
  const cleared = moveKbEntry(staged.entry.slug, '')
  assert.equal(cleared.entry.folderId, undefined)
  const removed = removeKbFolder(created.id)
  assert.equal(removed.removed, true)
  assert.equal(kbOverview().folders.some((folder) => folder.id === created.id), false)
})

test('kbOverview backfills COTO 2020 onto existing chapter entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-folder-backfill-'))
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  mkdirSync(join(root, 'kb'), { recursive: true })
  writeFileSync(join(root, 'kb', 'registry.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{
      slug: 'ch1',
      name: 'CHAPTER 1-GENERAL - DS VERSION OCT 2020.pdf',
      category: '规范',
      sourcePath: join(root, 'ch1.pdf'),
      managedPath: join(root, 'ch1.md'),
      originalName: 'CHAPTER 1-GENERAL - DS VERSION OCT 2020.pdf',
      sourceHash: 'x',
      sizeBytes: 1,
      chunkCount: 1,
      createdAt: 't',
      updatedAt: 't',
    }],
    removedSeeds: [],
  }))
  const overview = kbOverview()
  assert.equal(overview.folders.some((folder) => folder.name === 'COTO 2020' && folder.category === '规范'), true)
  assert.ok(overview.entries[0]?.folderId)
  assert.equal(overview.folders.find((folder) => folder.id === overview.entries[0]?.folderId)?.name, 'COTO 2020')
})

test('re-adding the same markdown keeps its folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-folder-keep-'))
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  const md = join(root, 'note.md')
  mkdirSync(root, { recursive: true })
  writeFileSync(md, '# 1.1 总则\n\n适用房屋。\n')
  const folder = createKbFolder('规范', '房屋规范')
  const added = addKbFile({ path: md, category: '规范', folderId: folder.id })
  assert.equal(added.entry.folderId, folder.id)
  const again = addKbFile({ path: md, category: '规范' })
  assert.equal(again.entry.folderId, folder.id)
})
