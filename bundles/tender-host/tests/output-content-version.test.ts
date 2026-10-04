import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyFileIfNewer, publishOfficialOutput } from '../src/outputs.ts'

test('output recovery checks bytes even when a replacement preserves size and older timestamps', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'output-version-'))
  try {
    const source = join(cwd, 'source.md')
    const dest = join(cwd, 'published.md')
    writeFileSync(source, 'new result')
    writeFileSync(dest, 'old result')
    utimesSync(source, 1, 1)
    utimesSync(dest, 2, 2)
    assert.equal(copyFileIfNewer(source, dest), true)
    assert.equal(readFileSync(dest, 'utf8'), 'new result')
    assert.equal(copyFileIfNewer(source, dest), false)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('publishing a long report registers a draft and does not assert acceptance', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'output-draft-'))
  try {
    const source = join(cwd, 'report.md')
    writeFileSync(source, '已完成。'.repeat(1000))
    const result = publishOfficialOutput(cwd, 'project', source, 'markdown')
    assert.equal(result.deliveryState, 'draft')
    assert.equal(readFileSync(result.dest, 'utf8'), readFileSync(source, 'utf8'))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
