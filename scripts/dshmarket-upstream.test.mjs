import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { isUpdatablePlugin } from '../vendor/dshmarket/lib/updates.js'
import { bundlesDroppedFromProfile, hasLoadableEntry, readProfileManifestSnapshot } from '../vendor/dshmarket/lib/profile.js'
import { sourceFallbackFor } from '../vendor/dshmarket/lib/sources.js'
import { classifyPnpmFailure } from '../vendor/dshmarket/lib/pnpm-compat.js'
import { restartReachableFrom, trustedRestartRequest } from '../vendor/dshmarket/lib/restart.js'

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

test('a patch-only carrier can mount its own file but cannot use a file outside the package', t => {
  const f = fixture(t)
  const carrier = 'node_modules/patch-carrier'
  f.write(carrier + '/package.json', { name: 'patch-carrier', dsh: { bundle: { patch: './cordis.patch.yml' } } })
  f.write(carrier + '/ui/view.js', 'export {}')
  f.write('node_modules/outside.js', 'export {}')
  f.write('external/view.js', 'export {}')
  symlinkSync(join(f.root, 'external'), join(f.root, carrier, 'external'), 'junction')

  for (const [target, expected] of [
    ['./ui/view.js', true], ['patch-carrier/ui/view.js', true],
    ['./../outside.js', false], ['./..\\outside.js', false], ['./external/view.js', false],
  ]) {
    f.write(carrier + '/cordis.patch.yml', `- insert:\n    - id: carrier-ui\n      name: '${target}'\n`)
    assert.equal(hasLoadableEntry(f.root, 'patch-carrier', null), expected, target)
  }
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

test('Windows lockfile temporary-write failures retain the upstream profile-file recovery classification', () => {
  for (const path of ['C:\\profile\\pnpm-lock.yaml.3015012533', 'C:\\profile\\node_modules\\.pnpm\\lock.yaml.3015012533']) {
    const failure = classifyPnpmFailure(`EPERM: operation not permitted, rename '${path}' -> '${path.replace(/\.\d+$/, '')}'`, 1)
    assert.equal(failure.code, 'profile-file-locked')
    assert.equal(failure.recoverable, false)
  }
  assert.equal(classifyPnpmFailure("EPERM: operation not permitted, rename 'C:\\profile\\some-pkg\\lock.yaml.123' -> 'C:\\profile\\some-pkg\\lock.yaml'", 1).code, 'windows-file-locked')
})

test('restart availability predicts direct loopback and retains the POST origin fence', () => {
  const local = { headers: { host: '127.0.0.1:7000' }, socket: { remoteAddress: '127.0.0.1' } }
  assert.equal(restartReachableFrom(local), true)
  assert.equal(trustedRestartRequest(local), false)
  assert.equal(trustedRestartRequest({ ...local, headers: { ...local.headers, origin: 'http://127.0.0.1:7000' } }), true)
  assert.equal(restartReachableFrom({ ...local, headers: { ...local.headers, 'x-forwarded-for': '10.0.0.4' } }), false)
  assert.equal(restartReachableFrom({ ...local, socket: { remoteAddress: '10.0.0.4' } }), false)
})

test('desktop store drift offers restart migration without unsafe live-reinstall advice', () => {
  const previous = process.env.AGENT_PI_DESKTOP
  process.env.AGENT_PI_DESKTOP = '1'
  try {
    const failure = classifyPnpmFailure('ERR_PNPM_UNEXPECTED_STORE Unexpected store location', 1)
    assert.equal(failure.code, 'unexpected-store')
    assert.equal(failure.recoverable, false)
    assert.match(failure.message, /重启/)
    assert.doesNotMatch(failure.message, /--force|--store-dir|storeDir:/)
  } finally {
    if (previous === undefined) delete process.env.AGENT_PI_DESKTOP
    else process.env.AGENT_PI_DESKTOP = previous
  }
})
