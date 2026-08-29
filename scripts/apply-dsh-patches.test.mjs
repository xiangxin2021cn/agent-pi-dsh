import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { assertDshCheckoutClean, prepareDshKernel } from './apply-dsh-patches.mjs'

function createCleanCheckout() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-clean-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(join(dir, 'package.json'), '{"version":"0.1.2-alpha.1"}\n')
  spawnSync('git', ['add', 'package.json'], { cwd: dir })
  const committed = spawnSync('git', [
    '-c', 'user.name=Agent Pi Test',
    '-c', 'user.email=agent-pi-test@example.invalid',
    'commit', '-qm', 'fixture',
  ], { cwd: dir, encoding: 'utf8' })
  assert.equal(committed.status, 0, committed.stderr)
  return dir
}

test('official DSH guard accepts a byte-clean checkout', () => {
  const dshRoot = createCleanCheckout()
  assert.equal(assertDshCheckoutClean({ dshRoot }), 'clean')
  assert.equal(prepareDshKernel({ dshRoot }), 'clean')
})

test('official DSH guard refuses tracked and untracked source changes', () => {
  const tracked = createCleanCheckout()
  writeFileSync(join(tracked, 'package.json'), '{"version":"modified"}\n')
  assert.throws(() => assertDshCheckoutClean({ dshRoot: tracked }), /must remain byte-clean[\s\S]*package\.json/)

  const untracked = createCleanCheckout()
  writeFileSync(join(untracked, 'product-patch.ts'), 'export {}\n')
  assert.throws(() => assertDshCheckoutClean({ dshRoot: untracked }), /must remain byte-clean[\s\S]*product-patch\.ts/)
})

test('development and packaging entrypoints enforce the clean DSH guard', () => {
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

test('development bootstrap installs the locked tender host runtime dependencies', () => {
  const root = join(import.meta.dirname, '..')
  const dev = readFileSync(join(root, 'scripts/dev.ps1'), 'utf8')
  assert.match(dev, /bundles\\tender-host/)
  assert.match(dev, /node_modules\\pdf-lib/)
  assert.match(dev, /npm ci --no-fund --no-audit/)
})
