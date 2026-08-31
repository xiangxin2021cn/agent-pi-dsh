import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { clientSource } from './client-source.ts'

const root = dirname(fileURLToPath(import.meta.url))
const client = clientSource
const sheet = readFileSync(join(root, '../lib/univer-assets/univer-sheet.js'), 'utf8')

test('overlay embeds Univer iframe and saves back to the original path', () => {
  assert.match(client, /ap-univer-frame/)
  assert.match(client, /office\.engine === 'univer-office'/)
  assert.match(client, /isOffice && office && office\.engine === 'univer-office'/)
  assert.match(client, /office\.engine === 'univer'/)
  assert.match(client, /office\.viewerUrl/)
  assert.match(client, /type: 'ap-univer'/)
  assert.match(client, /action: 'save'/)
  assert.match(client, /univerDirty/)
  assert.match(client, /ap-doc-scroll\.univer/)
  assert.match(client, /isOffice && !isOfficeUniver \? DocBtn\(isSlimUniver \? '对话完全体' : '用 Univer 打开'/)
  assert.match(client, /timeoutMs: 120000/)
  assert.match(client, /共 ' \+ names\.length \+ ' 张表/)
})

test('Univer page posts dirty and saved events then POSTs the snapshot', () => {
  assert.match(sheet, /\/api\/agent-pi\/files\/univer/)
  assert.match(sheet, /\/api\/agent-pi\/files\/save/)
  assert.match(sheet, /univer: workbook/)
  assert.match(sheet, /notify\('dirty'/)
  assert.match(sheet, /notify\('saved'/)
  assert.match(sheet, /createUniver/)
  assert.match(sheet, /createWorkbook/)
  assert.match(sheet, /sheetBar: true/)
  assert.match(sheet, /notify\('ready'/)
})
