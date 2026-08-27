import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  PREVIEW_HEAD_CHARS,
  PREVIEW_TABLE_ROW_CAP,
  inlineMarkdown,
  isInsideApDoc,
  mdToHtml,
  previewIsHeavy,
  restoreCappedTables,
  slicePreviewMarkdown,
} from '../src/md-preview.ts'

function bigTable(rows: number): string {
  const lines = ['| Item | Rate |', '| --- | --- |']
  for (let i = 0; i < rows; i++) lines.push('| C1.2.' + i + ' | 12.50 |')
  return lines.join('\n')
}

test('plain table cells skip markup regex and stay escaped', () => {
  assert.equal(inlineMarkdown('12.50'), '12.50')
  assert.equal(inlineMarkdown('a < b'), 'a &lt; b')
  assert.match(inlineMarkdown('**bold**'), /<strong>bold<\/strong>/)
})

test('citation chips still round-trip after the fast path', () => {
  const html = inlineMarkdown('see [kb:colto:chunk-1] and [src:Volume 3.md#L10-L12]')
  assert.match(html, /data-cite="kb:colto:chunk-1"/)
  assert.match(html, /data-cite-token="\[kb:colto:chunk-1\]"/)
  assert.match(html, /data-cite="src:Volume 3.md#L10-L12"/)
  assert.match(html, />colto</)
  assert.match(html, />Volume 3\.md · L10-L12</)
  assert.match(html, /title="点击查看出处"/)
})

test('a 2000-row table first paint keeps only the row cap plus an expand control', () => {
  const html = mdToHtml(bigTable(2000))
  const bodyRows = (html.match(/<td>/g) || []).length / 2
  assert.equal(bodyRows, PREVIEW_TABLE_ROW_CAP)
  assert.match(html, new RegExp('还有 ' + (2000 - PREVIEW_TABLE_ROW_CAP) + ' 行未显示'))
  assert.match(html, /data-md-expand="table"/)
  assert.match(html, /data-md-table="0"/)
  assert.match(html, /ap-doc-table-wrap/)
})

test('Infinity tableRowCap expands every row', () => {
  const html = mdToHtml(bigTable(120), { tableRowCap: Number.POSITIVE_INFINITY })
  assert.equal((html.match(/<td>/g) || []).length / 2, 120)
  assert.equal(html.includes('data-md-expand'), false)
})

test('a pipe row without a separator does not hang the preview', () => {
  const started = Date.now()
  const html = mdToHtml('# Title\n\n| a | b |\n\n| **合计** |  | 53,966,663 |\n\nplain after\n')
  assert.ok(Date.now() - started < 2000)
  assert.match(html, /合计/)
  assert.match(html, /53,966,663/)
  assert.match(html, /plain after/)
  assert.match(html, /<td>/)
})

test('headings and lists still render', () => {
  const html = mdToHtml('# Title\n\n- one\n- two\n')
  assert.match(html, /<h1>Title<\/h1>/)
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/)
})

test('MinerU HTML tables render as a grid instead of escaped tags', () => {
  const html = mdToHtml('Table A1.2.3-1\n<table><tr><td onclick="alert(1)">Fragile buildings</td><td>2,5</td></tr></table>\n')
  assert.match(html, /<table>/)
  assert.match(html, /<td>Fragile buildings<\/td>/)
  assert.match(html, /<td>2,5<\/td>/)
  assert.doesNotMatch(html, /&lt;table/)
  assert.doesNotMatch(html, /onclick/)
})

test('MinerU HTML tables also cap body rows', () => {
  const rows = ['<table>']
  for (let i = 0; i < 200; i++) rows.push('<tr><td>R' + i + '</td><td>1</td></tr>')
  rows.push('</table>')
  const html = mdToHtml(rows.join(''))
  const painted = (html.match(/<tr>/g) || []).length
  assert.equal(painted, PREVIEW_TABLE_ROW_CAP + 1)
  assert.match(html, /还有 119 行未显示/)
})

test('restoreCappedTables puts hidden pipe rows back after a WYSIWYG cap', () => {
  const original = bigTable(20)
  const edited = bigTable(5).replace('| C1.2.0 | 12.50 |', '| C1.2.0 | 99.00 |')
  const restored = restoreCappedTables(edited, original)
  assert.match(restored, /C1\.2\.0 \| 99\.00/)
  assert.match(restored, /C1\.2\.19 \| 12\.50/)
  assert.equal(restored.split('\n').length, original.split('\n').length)
})

test('escaped list markers still become a list', () => {
  const html = mdToHtml('\\- Scope\n\\- Definitions\n')
  assert.match(html, /<ul><li>Scope<\/li><li>Definitions<\/li><\/ul>/)
})

test('previewIsHeavy flags long markdown and wide tables', () => {
  assert.equal(previewIsHeavy('# ok\n\nshort'), false)
  assert.equal(previewIsHeavy(bigTable(2000)), true)
  assert.equal(previewIsHeavy('x'.repeat(80_001)), true)
})

test('slicePreviewMarkdown cuts a huge file on a line boundary', () => {
  const lines = []
  for (let i = 0; i < 4000; i++) lines.push('line-' + i + ' ' + 'x'.repeat(20))
  const raw = lines.join('\n')
  const sliced = slicePreviewMarkdown(raw)
  assert.equal(sliced.truncated, true)
  assert.ok(sliced.text.length <= PREVIEW_HEAD_CHARS)
  assert.equal(sliced.text.includes('\nline-'), true)
  assert.equal(slicePreviewMarkdown('# short').truncated, false)
})

test('client preview copies the heavy-md slice and does not auto-fill tables', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
  assert.match(page, /function slicePreviewMarkdown/)
  assert.match(page, /function previewIsHeavy/)
  assert.match(page, /function restoreCappedTables/)
  assert.match(page, /function stitchMarkdown/)
  assert.match(page, /文档较大，先显示前/)
  assert.match(page, /所见即所得只渲染前/)
  assert.match(page, /body\.binary && !body\.text/)
  assert.match(page, /DocBtn\(mode === 'edit' \? '预览' : '编辑', toggleMode/)
  assert.match(page, /if \(kbSlug\) \{[\s\S]*?setMode\('preview'\)/)
  assert.match(page, /if \(nextKind === 'markdown'\) \{\s*setMode\('preview'\)/)
  assert.doesNotMatch(page, /if \(nextKind === 'markdown'\) \{\s*setMode\('edit'\)/)
  assert.doesNotMatch(page, /wysiwygTouched\.current = false\s+setMode\('edit'\)/)
  assert.doesNotMatch(page, /setSourceMode\(previewIsHeavy/)
  assert.doesNotMatch(page, /setSourceMode\(heavy \|\| isOffice\)/)
  assert.doesNotMatch(page, /&& !sourceMode && !heavy/)
  assert.doesNotMatch(page, /if \(mode === 'preview' && previewBoxRef\.current\) \{\s*beginFill/)
  assert.match(page, /\/api\/agent-pi\/pricing\/sensitive-diff/)
  assert.match(page, /recalculate: !!recalculate/)
  assert.match(page, /确认人工复核并全局调整/)
  assert.match(page, /data-ap-recalc-confirm/)
  assert.match(page, /function isPipeSeparatorRow/)
  assert.match(page, /function isPipeTableRow/)
  assert.match(page, /if \(!para\.length\)/)
})

test('brand paint helper skips the document preview subtree', () => {
  assert.equal(isInsideApDoc(null), false)
  assert.equal(isInsideApDoc({ closest: (sel) => sel === '.ap-doc' ? {} : null }), true)
  assert.equal(isInsideApDoc({ closest: () => null }), false)
  assert.equal(isInsideApDoc({
    nodeType: 3,
    parentElement: { closest: (sel: string) => sel === '.ap-doc' ? {} : null },
  }), true)
})
