import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { buildPreviewSelectionFollowup } from '../src/selection-rewrite.ts'

test('selection rewrite stays on the parent session', () => {
  const text = buildPreviewSelectionFollowup({
    filePath: 'Agent Pi Outputs/p1/boq-pricing/08-C3.1-Drains.md',
    selectedText: 'Labourer',
    instruction: '把熟练工单价改成和市场费率基线一致',
  })
  assert.match(text, /请在本主会话继续/)
  assert.match(text, /08-C3\.1-Drains\.md/)
  assert.match(text, /Labourer/)
  assert.match(text, /不要另开对话/)
})

test('client preview sends the selection to the main conversation', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
  assert.match(page, /buildPreviewSelectionFollowup/)
  assert.match(page, /dispatchToConversation/)
  assert.match(page, /AI 改选区/)
  assert.match(page, /const openAiSel/)
  assert.match(page, /const excerptForAi/)
})
