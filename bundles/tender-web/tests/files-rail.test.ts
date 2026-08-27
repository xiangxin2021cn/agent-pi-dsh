import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  FILES_RAIL_COLLAPSED,
  FILES_RAIL_EXPANDED,
  FILES_RAIL_MAX,
  FILES_RAIL_MIN,
  FILES_RAIL_STORAGE,
  FILES_RAIL_WIDTH_STORAGE,
  clampFilesRailWidth,
  filesRailCssWidth,
  filesRailSpace,
  readFilesRailOpen,
  readFilesRailWidth,
  writeFilesRailOpen,
  writeFilesRailWidth,
} from '../lib/files-rail.js'

test('files rail remembers collapse and reserves the 56px right strip', () => {
  const store = new Map()
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value) },
  }
  assert.equal(readFilesRailOpen(storage), true)
  writeFilesRailOpen(false, storage)
  assert.equal(store.get(FILES_RAIL_STORAGE), '0')
  assert.equal(readFilesRailOpen(storage), false)
  writeFilesRailOpen(true, storage)
  assert.equal(readFilesRailOpen(storage), true)
  assert.deepEqual(filesRailSpace(true, true), { rail: true, collapsed: false })
  assert.deepEqual(filesRailSpace(false, true), { rail: true, collapsed: true })
  assert.deepEqual(filesRailSpace(false, false), { rail: false, collapsed: false })
  assert.equal(FILES_RAIL_EXPANDED, 300)
  assert.equal(FILES_RAIL_COLLAPSED, 56)
})

test('files rail page copy collapses to a right icon strip, not a floating tab', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
  assert.match(page, /ap-files-dock\.collapsed/)
  assert.match(page, /ap-files-collapsed/)
  assert.match(page, /files\.collapse/)
  assert.match(page, /收起资源文件/)
  assert.match(page, /panelRight/)
  assert.equal(page.includes("writing-mode:vertical-rl"), false)
})

test('files rail page distinguishes markdown, sheet and word icons', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
  assert.match(page, /fileSheet/)
  assert.match(page, /fileWord/)
  assert.match(page, /fileMd/)
  assert.match(page, /ap-fico-sheet/)
  assert.match(page, /function fileIconClass/)
})

test('files rail width can be dragged and remembered', () => {
  const store = new Map()
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value) },
  }
  assert.equal(readFilesRailWidth(storage), FILES_RAIL_EXPANDED)
  assert.equal(clampFilesRailWidth(80), FILES_RAIL_MIN)
  assert.equal(clampFilesRailWidth(900), FILES_RAIL_MAX)
  assert.equal(writeFilesRailWidth(420, storage), 420)
  assert.equal(store.get(FILES_RAIL_WIDTH_STORAGE), '420')
  assert.equal(readFilesRailWidth(storage), 420)
  assert.equal(filesRailCssWidth(true, 420), 420)
  assert.equal(filesRailCssWidth(false, 420), FILES_RAIL_COLLAPSED)
})

test('files rail page exposes a width drag handle and CSS variable', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
  assert.match(page, /--ap-files-w/)
  assert.match(page, /ap-files-resizer/)
  assert.match(page, /files\.resize/)
  assert.match(page, /\[data-side="sidebar"\]/)
  assert.match(page, /function clampFilesRailWidth/)
})
