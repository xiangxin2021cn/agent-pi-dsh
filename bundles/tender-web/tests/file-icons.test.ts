import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { fileIconClass, fileIconName } from '../src/file-icons.ts'

test('file icons distinguish markdown, sheets, word, slides, and pdf', () => {
  assert.equal(fileIconName({ name: 'notes.md', type: 'file' }), 'fileMd')
  assert.equal(fileIconName({ name: 'BOQ.xlsx', type: 'file' }), 'fileSheet')
  assert.equal(fileIconName({ name: 'letter.doc', type: 'file' }), 'fileWord')
  assert.equal(fileIconName({ name: 'deck.pptx', type: 'file' }), 'filePpt')
  assert.equal(fileIconName({ name: 'spec.pdf', type: 'file' }), 'filePdf')
  assert.equal(fileIconName({ name: 'app.html', type: 'file' }), 'fileHtml')
  assert.equal(fileIconClass({ name: 'BOQ.xlsx', type: 'file' }), 'ap-fico-sheet')
  assert.equal(fileIconClass({ name: 'notes.md', type: 'file' }), 'ap-fico-md')
  assert.notEqual(fileIconName({ name: 'a.md', type: 'file' }), fileIconName({ name: 'a.xlsx', type: 'file' }))
  assert.notEqual(fileIconName({ name: 'a.md', type: 'file' }), fileIconName({ name: 'a.doc', type: 'file' }))
})

test('client bundle copies the distinct office icons', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
  assert.match(page, /fileSheet/)
  assert.match(page, /fileWord/)
  assert.match(page, /fileMd/)
  assert.match(page, /ap-fico-sheet/)
  assert.match(page, /function fileIconClass/)
  assert.match(page, /fill: 'currentColor'/)
  assert.match(page, /M7 13h10M7 16\.5h10M10\.5 10v7M14\.5 10v7/)
  assert.match(page, /M7\.5 16V8l4\.5 6 4\.5-6v8/)
  assert.match(page, /#217346/)
  assert.match(page, /#0e7490/)
  assert.match(page, /m7\.4 8 2\.3 9/)
  assert.match(page, /points: '9,8 17,12 9,16'/)
})
