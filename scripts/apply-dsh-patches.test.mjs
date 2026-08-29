import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { applyDshPatch, prepareDshKernel } from './apply-dsh-patches.mjs'

function createNativeAlphaFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-native-alpha-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(join(dir, 'package.json'), '{"version":"0.1.2-alpha.1"}\n')
  for (const marker of [
    'apps/cli/package.json',
    'packages/api/session-controller/package.json',
    'packages/preset/agent-presets/presets/standard/agent.cordis.yml',
  ]) {
    const path = join(dir, marker)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, 'fixture\n')
  }
  return dir
}

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

test('DSH patch recognizes an already-applied CRLF checkout with real Git', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-patch-crlf-'))
  const patchPath = join(dir, 'change.patch')
  spawnSync('git', ['init', '-q'], { cwd: dir })
  const filePath = join(dir, 'sample.txt')
  const before = Buffer.from('first\tvalue\r\n  after\r\nlast\r\n')
  writeFileSync(filePath, before)
  writeFileSync(patchPath, [
    'diff --git a/sample.txt b/sample.txt',
    '--- a/sample.txt',
    '+++ b/sample.txt',
    '@@ -1,3 +1,3 @@',
    ' first value',
    '-  before',
    '+  after',
    ' last',
    '',
  ].join('\n'))

  const strict = spawnSync('git', ['-C', dir, 'apply', '--reverse', '--check', patchPath], {
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.notEqual(strict.status, 0)
  assert.equal(applyDshPatch({ dshRoot: dir, patchPath }), 'already-applied')
  assert.deepEqual(readFileSync(filePath), before)
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

test('native alpha.1 applies its migration patch once for development and release', () => {
  const dshRoot = createNativeAlphaFixture()
  const patchPath = join(dshRoot, 'missing.patch')
  const alphaPatchPath = join(dshRoot, 'alpha.patch')
  writeFileSync(alphaPatchPath, [
    'diff --git a/packages/preset/agent-presets/presets/standard/agent.cordis.yml b/packages/preset/agent-presets/presets/standard/agent.cordis.yml',
    '--- a/packages/preset/agent-presets/presets/standard/agent.cordis.yml',
    '+++ b/packages/preset/agent-presets/presets/standard/agent.cordis.yml',
    '@@ -1 +1 @@',
    '-fixture',
    '+migrated',
    '',
  ].join('\n'))

  assert.equal(
    prepareDshKernel({ dshRoot, patchPath, alphaPatchPath, purpose: 'development' }),
    'native-alpha1-development-applied',
  )
  assert.equal(
    readFileSync(join(dshRoot, 'packages/preset/agent-presets/presets/standard/agent.cordis.yml'), 'utf8').replace(/\r\n/g, '\n'),
    'migrated\n',
  )
  assert.equal(
    prepareDshKernel({ dshRoot, patchPath, alphaPatchPath, purpose: 'release' }),
    'native-alpha1-release-already-applied',
  )
})

test('development migration refuses an incomplete or different native layout', () => {
  const dshRoot = createNativeAlphaFixture()
  writeFileSync(join(dshRoot, 'package.json'), '{"version":"0.1.2-alpha.2"}\n')
  const patchPath = join(dshRoot, 'fallback.patch')
  writeFileSync(patchPath, 'fixture\n')

  assert.throws(
    () => prepareDshKernel({
      dshRoot,
      patchPath,
      purpose: 'development',
      run: () => { throw new Error('legacy patch fallback reached') },
    }),
    /legacy patch fallback reached/,
  )
})

test('development and packaging entrypoints enforce the DSH patch', () => {
  const root = join(import.meta.dirname, '..')
  const alphaPatch = readFileSync(join(root, 'patches/deepseek-harness-agent-pi-alpha1.patch'), 'utf8')
  assert.match(alphaPatch, /packages\/compaction\/compaction-basic\/src\/fallback\.ts/)
  assert.match(alphaPatch, /packages\/llm\/llm-pi-ai\/src\/capacity\.ts/)
  for (const file of [
    'scripts/dev.ps1',
    'scripts/init-tender-profile.ps1',
  ]) {
    assert.match(
      readFileSync(join(root, file), 'utf8'),
      /apply-dsh-patches\.mjs["') ]+\$?Dsh["') ]+--development/,
    )
  }
  for (const file of [
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
