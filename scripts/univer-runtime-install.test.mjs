import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  defaultUniverRuntimeLockPath,
  loadNativeRuntimePackages,
  productionRuntimeManifest,
  resolveNpmInvocation,
  runtimeDependenciesReady,
  runtimePackagesForTarget,
  univerRuntimeReceiptName,
  validateUniverRuntimeLock,
  verifyUniverRuntimeReceipt,
  writeUniverRuntimeReceipt,
} from './install-univer-runtime-deps.mjs'

const scripts = dirname(fileURLToPath(import.meta.url))
const script = readFileSync(join(scripts, 'init-tender-profile.mjs'), 'utf8')
const installer = readFileSync(join(scripts, 'install-univer-runtime-deps.mjs'), 'utf8')
const workflow = readFileSync(join(scripts, '../.github/workflows/build-desktop-assets.yml'), 'utf8')
const windowsRuntime = readFileSync(join(scripts, 'prepare-win-runtime.ps1'), 'utf8')
const desktopMain = readFileSync(join(scripts, '../apps/desktop/main.mjs'), 'utf8')
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
  assert.match(workflow, /payload\/desktop\/runtime\/node\/node[\s\\]+payload\/desktop\/runtime\/product\/scripts\/install-univer-runtime-deps\.mjs[\s\\]+payload\/desktop\/runtime\/product\/vendor\/dsh-univer-office[\s\\]+--verify-only/)
  assert.equal(workflow.match(/install-univer-runtime-deps\.mjs/g)?.length, 2)
  assert.match(installer, /'ci'/)
  assert.match(installer, /'--include=optional'/)
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
  const windowsPack = readFileSync(join(scripts, 'pack-win.ps1'), 'utf8')
  assert.match(windowsPack, /resources\\runtime\\node\\node\.exe/)
  assert.match(windowsPack, /install-univer-runtime-deps\.mjs[^\r\n]+--verify-only/)
  assert.match(desktopMain, /if \(packaged\) env\.AGENT_PI_SKIP_UNIVER_INSTALL = '1'/)
})

function targetFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-ready-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dependencies = { '@scope/binding': '2', a: '1' }
  const fixtureLock = {
    packages: {
      'node_modules/a': { version: '1.0.0', dependencies: { transitive: '3.0.0' } },
      'node_modules/transitive': { version: '3.0.0' },
      'node_modules/@scope/binding': {
        version: '2.0.0',
        optionalDependencies: {
          '@scope/binding-darwin-arm64': '2.0.0',
          '@scope/binding-linux-x64-gnu': '2.0.0',
          '@scope/binding-win32-x64-msvc': '2.0.0',
        },
      },
      'node_modules/@scope/binding-darwin-arm64': {
        version: '2.0.0', optional: true, os: ['darwin'], cpu: ['arm64'],
      },
      'node_modules/@scope/binding-linux-x64-gnu': {
        version: '2.0.0', optional: true, os: ['linux'], cpu: ['x64'], libc: ['glibc'],
      },
      'node_modules/@scope/binding-win32-x64-msvc': {
        version: '2.0.0', optional: true, os: ['win32'], cpu: ['x64'],
      },
    },
  }
  return { root, dependencies, fixtureLock }
}

function writeRuntimePackage(root, name, version, { native = false, main = 'binding.node' } = {}) {
  const packageRoot = join(root, 'node_modules', ...name.split('/'))
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({ name, version, ...(native ? { main } : {}) })}\n`)
  writeFileSync(join(packageRoot, 'index.js'), `export const packageName = ${JSON.stringify(name)}\n`)
  if (native && main) writeFileSync(join(packageRoot, main), 'native fixture\n')
}

function populateTargetFixture(root) {
  writeRuntimePackage(root, 'a', '1.0.0')
  writeRuntimePackage(root, 'transitive', '3.0.0')
  writeRuntimePackage(root, '@scope/binding', '2.0.0')
  writeRuntimePackage(root, '@scope/binding-win32-x64-msvc', '2.0.0', { native: true })
}

test('Univer readiness requires every direct production package at the locked version', (t) => {
  const { root, dependencies, fixtureLock } = targetFixture(t)
  const target = { platform: 'win32', arch: 'x64', libc: null }
  assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock, target), false)
  for (const [name, version] of [['a', '1.0.0'], ['@scope/binding', '2.0.0']]) {
    const packageRoot = join(root, 'node_modules', ...name.split('/'))
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({ name, version })}\n`)
  }
  writeRuntimePackage(root, 'transitive', '3.0.0')
  writeRuntimePackage(root, '@scope/binding-win32-x64-msvc', '2.0.0', { native: true })
  assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock, target), true)
  rmSync(join(root, 'node_modules', 'transitive'), { recursive: true })
  assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock, target), false)
  writeRuntimePackage(root, 'transitive', '3.0.0')
  writeFileSync(join(root, 'node_modules', 'a', 'package.json'), '{"name":"a","version":"0.9.0"}\n')
  assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock, target), false)
})

test('target runtime package selection covers the supported Windows, macOS, and Linux builds', () => {
  const expected = {
    'win32/x64': [
      '@libsql/win32-x64-msvc',
      '@univerjs-pro/engine-formula-rust-binding-win32-x64-msvc',
      '@univerjs-pro/exchange-node-binding-win32-x64-msvc',
    ],
    'darwin/arm64': [
      '@libsql/darwin-arm64',
      '@univerjs-pro/engine-formula-rust-binding-darwin-arm64',
      '@univerjs-pro/exchange-node-binding-darwin-arm64',
    ],
    'linux/x64': [
      '@libsql/linux-x64-gnu',
      '@univerjs-pro/engine-formula-rust-binding-linux-x64-gnu',
      '@univerjs-pro/exchange-node-binding-linux-x64-gnu',
    ],
  }
  for (const [key, nativeNames] of Object.entries(expected)) {
    const [platform, arch] = key.split('/')
    const target = { platform, arch, libc: platform === 'linux' ? 'glibc' : null }
    const selected = runtimePackagesForTarget(pinnedDependencies, lock, target)
    assert.deepEqual(selected.filter((item) => item.native).map((item) => item.name), nativeNames)
    const closure = selected.filter((item) => !item.native)
    assert.equal(closure.length, 31)
    assert.ok(closure.some((item) => item.lockPath === 'node_modules/zod'))
    assert.ok(closure.some((item) => item.lockPath === 'node_modules/cliui/node_modules/string-width'))
    assert.ok(Object.keys(pinnedDependencies).every((name) => closure.some((item) => item.name === name)))
  }
})

test('Univer readiness fails closed for a missing, wrong-version, or missing-main native package', async (t) => {
  for (const failure of ['missing', 'wrong-version', 'missing-main']) {
    await t.test(failure, (t) => {
      const { root, dependencies, fixtureLock } = targetFixture(t)
      const target = { platform: 'linux', arch: 'x64', libc: 'glibc' }
      writeRuntimePackage(root, 'a', '1.0.0')
      writeRuntimePackage(root, '@scope/binding', '2.0.0')
      if (failure !== 'missing') {
        writeRuntimePackage(
          root,
          '@scope/binding-linux-x64-gnu',
          failure === 'wrong-version' ? '1.9.0' : '2.0.0',
          { native: true, main: failure === 'missing-main' ? 'missing.node' : 'binding.node' },
        )
        if (failure === 'missing-main') rmSync(join(root, 'node_modules', '@scope', 'binding-linux-x64-gnu', 'missing.node'))
      }
      assert.equal(runtimeDependenciesReady(root, dependencies, fixtureLock, target), false)
    })
  }
})

test('runtime receipt binds every file in each selected package', (t) => {
  const { root, dependencies, fixtureLock } = targetFixture(t)
  const target = { platform: 'win32', arch: 'x64', libc: null }
  const lockPath = join(root, 'package-lock.json')
  writeFileSync(lockPath, `${JSON.stringify(fixtureLock, null, 2)}\n`)
  populateTargetFixture(root)
  const resource = join(root, 'node_modules', 'a', 'resource-manifest.json')
  writeFileSync(resource, '{"assets":[]}\n')

  writeUniverRuntimeReceipt(root, dependencies, fixtureLock, lockPath, target)
  assert.equal(existsSync(join(root, univerRuntimeReceiptName)), true)
  assert.doesNotThrow(() => verifyUniverRuntimeReceipt(root, dependencies, fixtureLock, lockPath, target))

  rmSync(resource)
  assert.throws(
    () => verifyUniverRuntimeReceipt(root, dependencies, fixtureLock, lockPath, target),
    /runtime receipt file tree mismatch/,
  )
})

test('native runtime verification loads every selected binary and fails closed on loader errors', (t) => {
  const { root, dependencies, fixtureLock } = targetFixture(t)
  const target = { platform: 'darwin', arch: 'arm64', libc: null }
  writeRuntimePackage(root, 'a', '1.0.0')
  writeRuntimePackage(root, '@scope/binding', '2.0.0')
  writeRuntimePackage(root, '@scope/binding-darwin-arm64', '2.0.0', { native: true })
  const loaded = []
  loadNativeRuntimePackages(root, dependencies, fixtureLock, target, (main) => loaded.push(main))
  assert.deepEqual(loaded.map((path) => path.endsWith(join('@scope', 'binding-darwin-arm64', 'binding.node'))), [true])
  assert.throws(
    () => loadNativeRuntimePackages(root, dependencies, fixtureLock, target, () => {
      throw new Error('invalid native binary')
    }),
    /failed to load locked native Univer runtime @scope\/binding-darwin-arm64: invalid native binary/,
  )
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
