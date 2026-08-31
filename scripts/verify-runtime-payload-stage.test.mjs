import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const verifier = join(import.meta.dirname, 'verify-runtime-payload-stage.mjs')

function run(stage) {
  return spawnSync(process.execPath, [verifier, stage], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

test('portable runtime payload stage rejects VCS and dependency trees', () => {
  const stage = mkdtempSync(join(tmpdir(), 'agent-pi-payload-stage-'))
  mkdirSync(join(stage, 'deepseek-harness', 'apps', 'web'), { recursive: true })
  writeFileSync(join(stage, 'deepseek-harness', 'package.json'), '{}\n')

  const clean = run(stage)
  assert.equal(clean.status, 0, clean.stderr || clean.stdout)

  writeFileSync(join(stage, 'deepseek-harness', '.git'), 'gitdir: elsewhere\n')
  const vcs = run(stage)
  assert.notEqual(vcs.status, 0)
  assert.match(vcs.stderr, /deepseek-harness[\\/].git/)

  mkdirSync(join(stage, 'product', 'vendor', 'plugin', 'node_modules'), { recursive: true })
  const dependencies = run(stage)
  assert.notEqual(dependencies.status, 0)
  assert.match(dependencies.stderr, /node_modules/)
})
