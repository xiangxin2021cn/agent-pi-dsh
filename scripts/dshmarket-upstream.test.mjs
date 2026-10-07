import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { isUpdatablePlugin } from '../vendor/dshmarket/src/updates.ts'
import { bundlesDroppedFromProfile, readProfileManifestSnapshot } from '../vendor/dshmarket/src/profile.ts'
import { sourceFallbackFor } from '../vendor/dshmarket/src/sources.ts'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-market-upstream-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, value) => {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value))
  }
  return { root, write }
}

test('market updates exclude a plain CLI while retaining manifest, bundle and patch plugins', t => {
  const f = fixture(t)
  f.write('node_modules/plain-cli/package.json', { name: 'plain-cli', bin: 'cli.js' })
  assert.equal(isUpdatablePlugin(f.root, 'plain-cli', new Set()), false)
  f.write('node_modules/declared/package.json', { name: 'declared', dsh: { bundle: { patch: './cordis.patch.yml' } } })
  assert.equal(isUpdatablePlugin(f.root, 'declared', new Set()), true)
  assert.equal(isUpdatablePlugin(f.root, 'plain-cli', new Set(['plain-cli'])), true)
  f.write('cordis.patch.yml', '- insert:\n    - id: plain\n      name: plain-cli\n')
  assert.equal(isUpdatablePlugin(f.root, 'plain-cli', new Set()), true)
})

test('lost bundle rows are reported without changing user disablement or reporting uninstall', t => {
  const f = fixture(t)
  const manifest = { dependencies: { retained: '1', removed: '1', updated: '1' }, dsh: { profile: { bundles: ['retained', 'removed', 'updated'] } } }
  f.write('package.json', manifest)
  const before = readProfileManifestSnapshot('tender', f.root)
  delete manifest.dependencies.removed
  manifest.dsh.profile.bundles = []
  f.write('package.json', manifest)
  const bytes = readFileSync(join(f.root, 'package.json'), 'utf8')
  assert.deepEqual(bundlesDroppedFromProfile(before, 'tender', f.root, new Set(['updated'])), ['retained'])
  assert.equal(readFileSync(join(f.root, 'package.json'), 'utf8'), bytes)
})

test('release tarball fallback stays within the catalog entry source', () => {
  const tarball = 'https://github.com/example/plugin/releases/download/v1/plugin.tgz'
  const entry = { url: 'https://github.com/example/plugin', tarball }
  assert.equal(sourceFallbackFor(entry, tarball), 'github:example/plugin')
  assert.equal(sourceFallbackFor(entry, 'example-plugin'), null)
  assert.equal(sourceFallbackFor(entry, 'github:example/plugin'), null)
  const foreign = 'https://github.com/another/plugin/releases/download/v1/plugin.tgz'
  assert.equal(sourceFallbackFor({ ...entry, tarball: foreign }, foreign), null)
})
