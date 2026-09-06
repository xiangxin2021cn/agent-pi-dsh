import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { assertCadIntegrationUnchanged, CAD_INPUT_PATHS } from './cad-integration-compatibility.mjs'

const cli = fileURLToPath(new URL('./cad-integration-compatibility.mjs', import.meta.url))

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function commit(root) {
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  return git(root, 'rev-parse', 'HEAD')
}

function fixture(t, missingPath) {
  const directory = mkdtempSync(join(tmpdir(), 'agent-pi-cad-compatibility-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const root = join(directory, 'checkout')
  mkdirSync(root)
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 'CAD Compatibility Test')
  git(root, 'config', 'user.email', 'cad@example.invalid')
  for (const path of CAD_INPUT_PATHS) {
    if (path === missingPath) continue
    write(join(root, path === 'tools/mlightcad-poc' ? `${path}/src/viewer.js` : path),
      path === 'package.json' ? '{"version":"3.6.2","license":"GPL-3.0-only"}\n' : `fixture ${path}\n`)
  }
  const sourceCommit = commit(root)
  const sourceTree = git(root, 'rev-parse', 'HEAD^{tree}')
  const manifest = {
    schema: 'agent-pi-dsh/cad-clean-build/v1',
    releaseVersion: '3.6.2',
    sources: { agentPiDshCadIntegration: { commit: sourceCommit, tree: sourceTree, tag: 'v3.6.2' } },
  }
  return { root, directory, manifest }
}

test('accepts the original CAD commit without changing its provenance', (t) => {
  const value = fixture(t)
  const before = structuredClone(value.manifest)
  const proof = assertCadIntegrationUnchanged(value)
  assert.equal(proof.sourceCommit, proof.releaseCommit)
  assert.equal(proof.sourceTree, value.manifest.sources.agentPiDshCadIntegration.tree)
  assert.deepEqual(proof.inputPaths, CAD_INPUT_PATHS)
  assert.deepEqual(value.manifest, before)
})

test('permits installer and publication changes while retaining the original CAD commit', (t) => {
  const value = fixture(t)
  for (const path of [
    'scripts/nsis/setup.nsi', 'scripts/pack-win.ps1', 'scripts/pack-runtime-payload.mjs',
    'scripts/cad-integration-compatibility.mjs', 'release/publish-v3.6.2-release.mjs',
  ]) write(join(value.root, path), 'packaging repair\n')
  const releaseCommit = commit(value.root)
  const proof = assertCadIntegrationUnchanged(value)
  assert.equal(proof.releaseCommit, releaseCommit)
  assert.equal(proof.sourceCommit, value.manifest.sources.agentPiDshCadIntegration.commit)
  assert.notEqual(proof.releaseCommit, proof.sourceCommit)
})

for (const input of CAD_INPUT_PATHS) {
  test(`rejects a committed CAD input change: ${input}`, (t) => {
    const value = fixture(t)
    const path = input === 'tools/mlightcad-poc' ? `${input}/src/viewer.js` : input
    const current = readFileSync(join(value.root, path), 'utf8')
    write(join(value.root, path), `${current}\n`)
    commit(value.root)
    assert.throws(() => assertCadIntegrationUnchanged(value), (error) =>
      error.message.includes('CAD inputs changed') && error.message.includes(path))
  })
}

test('rejects added, removed and executable-mode changes within the CAD tree', (t) => {
  for (const change of ['added', 'removed', 'mode']) {
    const value = fixture(t)
    const path = 'tools/mlightcad-poc/src/viewer.js'
    if (change === 'added') write(join(value.root, 'tools/mlightcad-poc/package-lock.json'), '{}\n')
    if (change === 'removed') {
      git(value.root, 'rm', path)
      write(join(value.root, 'tools/mlightcad-poc/src/another.js'), 'replacement\n')
    }
    if (change === 'mode') {
      git(value.root, 'update-index', '--chmod=+x', path)
      git(value.root, 'commit', '-qm', 'changed executable bit')
    } else commit(value.root)
    assert.throws(() => assertCadIntegrationUnchanged(value), /CAD inputs changed/)
  }
})

test('rejects missing required inputs even if both commits lack them', (t) => {
  const value = fixture(t, 'scripts/cad-clean-pins.json')
  assert.throws(() => assertCadIntegrationUnchanged(value), /required CAD input is missing.*cad-clean-pins/)
})

test('rejects missing or forged original Git identity and mismatched release identity', (t) => {
  const value = fixture(t)
  for (const [field, contents, message] of [
    ['commit', 'HEAD', /full original CAD source commit/],
    ['commit', '1'.repeat(40), /git rev-parse failed/],
    ['commit', value.manifest.sources.agentPiDshCadIntegration.tree, /git rev-parse failed/],
    ['tree', '2'.repeat(40), /recorded tree/],
    ['tag', 'v3.6.1', /release version\/tag/],
  ]) {
    const manifest = structuredClone(value.manifest)
    manifest.sources.agentPiDshCadIntegration[field] = contents
    assert.throws(() => assertCadIntegrationUnchanged({ ...value, manifest }), message)
  }
  assert.throws(() => assertCadIntegrationUnchanged({ ...value, manifest: { ...value.manifest, releaseVersion: '3.6.1' } }), /release version\/tag/)
  assert.throws(() => assertCadIntegrationUnchanged({ ...value, manifest: { ...value.manifest, schema: 'unknown' } }), /schema/)
})

test('rejects tracked and untracked dirty CAD inputs', (t) => {
  for (const path of ['tools/mlightcad-poc/src/viewer.js', 'tools/mlightcad-poc/src/untracked.js']) {
    const value = fixture(t)
    write(join(value.root, path), 'uncommitted input\n')
    assert.throws(() => assertCadIntegrationUnchanged(value), /uncommitted changes/)
  }
})

test('CLI reports the original and release commits and propagates input mismatches', (t) => {
  const value = fixture(t)
  write(join(value.root, 'scripts/installer-remove-univer-tree.mjs'), 'installer fix\n')
  const releaseCommit = commit(value.root)
  const path = join(value.directory, 'CAD-CLEAN-BUILD.json')
  write(path, JSON.stringify(value.manifest))
  const args = [cli, '--root', value.root, '--manifest', path, '--release-commit', releaseCommit]
  const run = () => spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true })
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const proof = JSON.parse(result.stdout)
  assert.equal(proof.releaseCommit, releaseCommit)
  assert.equal(proof.sourceCommit, value.manifest.sources.agentPiDshCadIntegration.commit)
  assert.equal(readFileSync(path, 'utf8'), JSON.stringify(value.manifest))
  write(join(value.root, 'scripts/cad-clean-builder.Dockerfile'), 'changed toolchain\n')
  const failed = run()
  assert.notEqual(failed.status, 0)
  assert.match(failed.stderr, /uncommitted changes/)
})
