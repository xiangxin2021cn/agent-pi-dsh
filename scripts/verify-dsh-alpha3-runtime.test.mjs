import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  expectedDshCommit,
  verifyDshAlpha3Runtime,
} from './verify-dsh-alpha3-runtime.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-alpha3-runtime-'))
  const dsh = join(root, 'deepseek-harness')
  const product = join(root, 'product')
  mkdirSync(join(dsh, 'packages', 'bundle', 'base'), { recursive: true })
  mkdirSync(join(dsh, 'packages', 'bundle', 'sdk-minimal'), { recursive: true })
  mkdirSync(product, { recursive: true })
  writeFileSync(join(dsh, 'package.json'), '{"version":"0.1.2-alpha.3"}\n')
  for (const bundle of ['base', 'sdk-minimal']) {
    writeFileSync(
      join(dsh, 'packages', 'bundle', bundle, 'package.json'),
      '{"dependencies":{"@deepseek-ai/dsh-session-persistence-jsonl":"workspace:^"}}\n',
    )
  }
  writeFileSync(join(product, 'DSH_PIN'), `${expectedDshCommit}\n`)
  return { root, dsh, product }
}

test('accepts the pinned alpha.3 JSONL runtime', () => {
  const { dsh, product } = fixture()
  assert.doesNotThrow(() => verifyDshAlpha3Runtime(dsh, product))
})

test('rejects a stale removed SQLite persistence package', () => {
  const { dsh, product } = fixture()
  mkdirSync(join(dsh, 'packages', 'session', 'session-persistence-sqlite'), { recursive: true })
  assert.throws(
    () => verifyDshAlpha3Runtime(dsh, product),
    /removed SQLite persistence package/,
  )
})

test('rejects a mismatched DSH version or product pin', () => {
  const { root, dsh, product } = fixture()
  writeFileSync(join(dsh, 'package.json'), '{"version":"0.1.2-alpha.2"}\n')
  assert.throws(() => verifyDshAlpha3Runtime(dsh, product), /expected 0\.1\.2-alpha\.3/)

  const replacement = join(root, 'replacement')
  cpSync(dsh, replacement, { recursive: true })
  writeFileSync(join(replacement, 'package.json'), '{"version":"0.1.2-alpha.3"}\n')
  writeFileSync(join(product, 'DSH_PIN'), '14bab4422b12ab80cd79de59e086c12888fe00be\n')
  assert.throws(() => verifyDshAlpha3Runtime(replacement, product), /staged DSH_PIN/)
  rmSync(root, { recursive: true, force: true })
})
