import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  defaultUniverRuntimeLockPath,
  productionRuntimeManifest,
  resolveNpmInvocation,
  runtimeDependenciesReady,
  validateUniverRuntimeLock,
} from './install-univer-runtime-deps.mjs'

const scripts = dirname(fileURLToPath(import.meta.url))
const script = readFileSync(join(scripts, 'init-tender-profile.mjs'), 'utf8')
const installer = readFileSync(join(scripts, 'install-univer-runtime-deps.mjs'), 'utf8')
const workflow = readFileSync(join(scripts, '../.github/workflows/build-desktop-assets.yml'), 'utf8')
const windowsRuntime = readFileSync(join(scripts, 'prepare-win-runtime.ps1'), 'utf8')
const lock = JSON.parse(readFileSync(defaultUniverRuntimeLockPath, 'utf8'))
const pinnedDependencies = lock.packages[''].dependencies

test('Univer runtime install resolves only production dependencies in a clean staging folder', () => {
  assert.deepEqual(productionRuntimeManifest({
    name: 'dsh-univer-office',
    dependencies: { public: '1.0.0' },
    devDependencies: { insiders: '0.0.0-insiders' },
  }), {
    name: 'agent-pi-univer-runtime',
    private: true,
    dependencies: { public: '1.0.0' },
  })
  assert.match(script, /installUniverRuntimeDeps\(univerDir/)
  assert.match(workflow, /install-univer-runtime-deps\.mjs payload\/product\/vendor\/dsh-univer-office/)
  assert.match(installer, /'ci'/)
  assert.doesNotMatch(installer, /'install'/)
})

test('tracked Univer production lock exactly matches the pinned 0.2.9 dependency graph', () => {
  assert.deepEqual(pinnedDependencies, {
    '@puppeteer/browsers': '^3.2.0',
    '@univerjs-pro/cli-assets': '0.1.0',
    '@univerjs-pro/engine-formula-rust-binding': '1.0.0-insiders.20260819-8209aa8',
    '@univerjs-pro/exchange-node-binding': '0.1.0',
    libsql: '^0.5.29',
    'puppeteer-core': '^25.7.0',
  })
  assert.equal(validateUniverRuntimeLock({ dependencies: pinnedDependencies }, lock), lock)
  assert.throws(
    () => validateUniverRuntimeLock({ dependencies: { ...pinnedDependencies, added: '1.0.0' } }, lock),
    /does not match the pinned plugin manifest/,
  )
  for (const name of Object.keys(pinnedDependencies)) {
    const entry = lock.packages[`node_modules/${name}`]
    assert.ok(entry.version, name)
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, name)
    assert.match(entry.integrity, /^sha512-/, name)
  }
})

test('Windows package stages Univer production dependencies before first launch', () => {
  assert.match(windowsRuntime, /vendor\\dsh-univer-office/)
  assert.match(windowsRuntime, /install-univer-runtime-deps\.mjs/)
})

test('Univer readiness requires every direct production package at the locked version', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-ready-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dependencies = { a: '1', '@scope/b': '2' }
  const fixtureLock = {
    packages: {
      'node_modules/a': { version: '1.0.0' },
      'node_modules/@scope/b': { version: '2.0.0' },
    },
  }
  assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock), false)
  for (const [name, version] of [['a', '1.0.0'], ['@scope/b', '2.0.0']]) {
    const packageRoot = join(root, 'node_modules', ...name.split('/'))
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({ name, version })}\n`)
  }
  assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock), true)
  writeFileSync(join(root, 'node_modules', 'a', 'package.json'), '{"name":"a","version":"0.9.0"}\n')
  assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock), false)
})

test('npm ci runs through npm-cli.js adjacent to the current Node executable', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-node-toolchain-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const node = join(root, 'node.exe')
  const npmCli = join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  mkdirSync(dirname(npmCli), { recursive: true })
  writeFileSync(node, '')
  writeFileSync(npmCli, '')

  assert.deepEqual(resolveNpmInvocation(node), { command: node, prefix: [npmCli] })
  assert.throws(
    () => resolveNpmInvocation(join(root, 'isolated', 'node.exe')),
    /npm-cli\.js is not adjacent/,
  )
})
