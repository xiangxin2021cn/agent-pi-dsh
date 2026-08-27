import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  citationChipLabel,
  describeCitation,
  locatorFromText,
} from '../src/citations.ts'

test('locatorFromText keeps the last heading and page before the cite line', () => {
  const text = [
    '# Volume 3',
    '<!-- page 12 -->',
    '## 开挖与支护',
    '正文。',
    '第 13 页',
    '### 排水',
    '结论。',
  ].join('\n')
  const loc = locatorFromText(text, 6)
  assert.equal(loc.heading, '排水')
  assert.equal(loc.page, 13)
})

test('citationChipLabel is a short annotation, not the raw token', () => {
  assert.equal(citationChipLabel('kb:coto-ch4:c0012'), 'coto-ch4')
  assert.equal(citationChipLabel('src:docs/Volume 3.md#L10-L25'), 'Volume 3.md · L10-L25')
})

test('describeCitation for src returns file, page, heading — not body text', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cite-'))
  const src = join(cwd, 'Volume 3.md')
  writeFileSync(src, '# 技术规范\n<!-- page 8 -->\n## 1200 条款\n很长的规范原文 '.repeat(80) + '\n')
  const loc = describeCitation(cwd, {
    schemaVersion: 1,
    module: 'tender',
    projectId: 'p1',
    name: 't',
    rootPath: cwd,
    workflowId: 'tender-main',
    inputPaths: [src],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 'src:Volume 3.md#L3')
  assert.equal(loc.exists, true)
  assert.equal(loc.source, 'Volume 3.md')
  assert.equal(loc.heading, '1200 条款')
  assert.equal(loc.page, 8)
  assert.equal('text' in loc, false)
})
