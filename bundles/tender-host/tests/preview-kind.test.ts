import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { readWorkspaceFile } from '../src/files.ts'
import { previewKind } from '../src/preview-export.ts'

test('preview kinds distinguish office, html, markdown, and pdf', () => {
  assert.equal(previewKind('a.md'), 'markdown')
  assert.equal(previewKind('a.pdf'), 'pdf')
  assert.equal(previewKind('a.html'), 'html')
  assert.equal(previewKind('a.xlsx'), 'spreadsheet')
  assert.equal(previewKind('a.csv'), 'spreadsheet')
  assert.equal(previewKind('a.univer'), 'spreadsheet')
  assert.equal(previewKind('a.docx'), 'word')
  assert.equal(previewKind('a.pptx'), 'slides')
  assert.equal(previewKind('a.xls'), 'legacy-office')
  assert.equal(previewKind('a.doc'), 'legacy-office')
  assert.equal(previewKind('a.json'), 'text')
})

test('oversized markdown returns a text head instead of binary', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-md-head-'))
  const path = join(cwd, 'big.md')
  writeFileSync(path, '# title\n' + 'row\n'.repeat(4000), 'utf8')
  const file = readWorkspaceFile(cwd, path, 200)
  assert.equal(file.binary, undefined)
  assert.equal(file.truncated, true)
  assert.match(String(file.text), /^# title\n/)
  assert.ok(String(file.text).length <= 200)
})

test('content route keeps office files off the binary text reader', () => {
  const http = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/http.ts'), 'utf8')
  assert.match(http, /officeLike/)
  assert.match(http, /isUniverSheetPath\(path\)/)
  assert.match(http, /xlsx\|csv\|tsv\|docx\|pptx/)
  assert.match(http, /openUniverOfficePreview/)
  assert.match(http, /univer-office/)
  assert.match(http, /univerOfficePreviewKind/)
})

test('host HTTP attach keeps the live webServer instead of spreading the ctx proxy', () => {
  const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/index.ts'), 'utf8')
  assert.match(index, /webServer: inner\.webServer/)
  assert.doesNotMatch(index, /\.\.\.inner/)
})
