import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { kbOverview, parseKbEntry, stageKbFile } from '../src/kb.ts'

test('stageKbFile copies the original and waits for parse', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-stage-'))
  process.env.AGENT_PI_KB_ROOT = root
  const src = join(root, '水泥规范.md')
  writeFileSync(src, '# 5.2.3\n\nCement shall comply with GB 175.\n')
  const staged = stageKbFile({ path: src, category: '规范' })
  assert.equal(staged.staged, true)
  assert.equal(staged.entry.parseStatus, 'staged')
  assert.ok(staged.entry.originalPath && existsSync(staged.entry.originalPath))
  const listed = kbOverview().entries.find((entry) => entry.slug === staged.entry.slug)
  assert.ok(listed)
  assert.equal(listed.parseStatus, 'staged')
  const parsed = parseKbEntry(staged.entry.slug)
  assert.equal(parsed.entry.parseStatus, 'ready')
  assert.ok(parsed.entry.chunkCount > 0)
  const again = parseKbEntry(staged.entry.slug)
  assert.equal(again.skipped, true)
  const forced = parseKbEntry(staged.entry.slug, { force: true })
  assert.equal(forced.entry.parseStatus, 'ready')
  assert.ok(forced.entry.chunkCount > 0)
})
