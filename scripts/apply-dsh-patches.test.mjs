import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { applyDshPatch } from './apply-dsh-patches.mjs'

test('DSH patch application is safe and idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-patch-'))
  const patchPath = join(dir, 'change.patch')
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(join(dir, 'sample.txt'), 'before\n')
  writeFileSync(patchPath, [
    'diff --git a/sample.txt b/sample.txt',
    '--- a/sample.txt',
    '+++ b/sample.txt',
    '@@ -1 +1 @@',
    '-before',
    '+after',
    '',
  ].join('\n'))

  assert.equal(applyDshPatch({ dshRoot: dir, patchPath }), 'applied')
  assert.equal(readFileSync(join(dir, 'sample.txt'), 'utf8').replace(/\r\n/g, '\n'), 'after\n')
  assert.equal(applyDshPatch({ dshRoot: dir, patchPath }), 'already-applied')
})

test('DSH patch refuses a mismatched checkout without changing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-patch-conflict-'))
  const patchPath = join(dir, 'change.patch')
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(join(dir, 'sample.txt'), 'different\n')
  writeFileSync(patchPath, [
    'diff --git a/sample.txt b/sample.txt',
    '--- a/sample.txt',
    '+++ b/sample.txt',
    '@@ -1 +1 @@',
    '-before',
    '+after',
    '',
  ].join('\n'))

  assert.throws(
    () => applyDshPatch({ dshRoot: dir, patchPath }),
    /does not match the pinned DSH checkout/,
  )
  assert.equal(readFileSync(join(dir, 'sample.txt'), 'utf8'), 'different\n')
})

test('development and packaging entrypoints enforce the DSH patch', () => {
  const root = join(import.meta.dirname, '..')
  for (const file of [
    'scripts/dev.ps1',
    'scripts/init-tender-profile.ps1',
    'scripts/run-smoke.ps1',
    'scripts/prepare-win-runtime.ps1',
    'scripts/pack-runtime-payload.mjs',
  ]) {
    assert.match(readFileSync(join(root, file), 'utf8'), /apply-dsh-patches\.mjs/)
  }
})
