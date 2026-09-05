import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  expectedDshCommit,
  verifyDshRuntime,
} from './verify-dsh-runtime.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-runtime-'))
  const dsh = join(root, 'deepseek-harness')
  const product = join(root, 'product')
  mkdirSync(join(dsh, 'packages', 'bundle', 'base'), { recursive: true })
  mkdirSync(join(dsh, 'packages', 'bundle', 'sdk-minimal'), { recursive: true })
  mkdirSync(product, { recursive: true })
  writeFileSync(join(dsh, 'package.json'), '{"version":"0.1.3-alpha.1"}\n')
  for (const bundle of ['base', 'sdk-minimal']) {
    writeFileSync(
      join(dsh, 'packages', 'bundle', bundle, 'package.json'),
      '{"dependencies":{"@deepseek-ai/dsh-session-persistence-jsonl":"workspace:^"}}\n',
    )
  }
  writeFileSync(join(product, 'DSH_PIN'), `${expectedDshCommit}\n`)
  return { root, dsh, product }
}

test('accepts the pinned 0.1.3-alpha.1 JSONL runtime', () => {
  const { dsh, product } = fixture()
  assert.doesNotThrow(() => verifyDshRuntime(dsh, product))
})

test('rejects a stale removed SQLite persistence package', () => {
  const { dsh, product } = fixture()
  mkdirSync(join(dsh, 'packages', 'session', 'session-persistence-sqlite'), { recursive: true })
  assert.throws(
    () => verifyDshRuntime(dsh, product),
    /removed SQLite persistence package/,
  )
})

test('rejects a mismatched DSH version or product pin', () => {
  const { root, dsh, product } = fixture()
  writeFileSync(join(dsh, 'package.json'), '{"version":"0.1.2-alpha.5"}\n')
  assert.throws(() => verifyDshRuntime(dsh, product), /expected 0\.1\.3-alpha\.1/)

  const replacement = join(root, 'replacement')
  cpSync(dsh, replacement, { recursive: true })
  writeFileSync(join(replacement, 'package.json'), '{"version":"0.1.3-alpha.1"}\n')
  writeFileSync(join(product, 'DSH_PIN'), '14bab4422b12ab80cd79de59e086c12888fe00be\n')
  assert.throws(() => verifyDshRuntime(replacement, product), /staged DSH_PIN/)
  rmSync(root, { recursive: true, force: true })
})

test('native CLI check loads both modules from the staged JSONL consumer', (t) => {
  const { root, dsh, product } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const consumer = join(dsh, 'packages', 'session', 'session-persistence-jsonl')
  for (const name of ['fs-ext', 'koffi']) {
    const moduleDir = join(consumer, 'node_modules', name)
    mkdirSync(moduleDir, { recursive: true })
    writeFileSync(join(moduleDir, 'index.js'), 'module.exports = {}\n')
  }
  const run = () => spawnSync(process.execPath, [
    join(import.meta.dirname, 'verify-dsh-runtime.mjs'), dsh, product, '--native',
  ], { encoding: 'utf8' })
  const valid = run()
  assert.equal(valid.status, 0, valid.stderr)
  writeFileSync(join(consumer, 'node_modules', 'fs-ext', 'index.js'), "throw new Error('native ABI mismatch')\n")
  const invalid = run()
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /native ABI mismatch/)
})

test('native CLI check fails if either staged dependency is absent', (t) => {
  const { root, dsh, product } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [
    join(import.meta.dirname, 'verify-dsh-runtime.mjs'), dsh, product, '--native',
  ], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Cannot find module 'fs-ext'/)
})
