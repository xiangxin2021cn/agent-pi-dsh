import assert from 'node:assert/strict'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { BUILTIN_SOURCE, NODE_ADDON_API, assertMacOS12, assertSystemDylibs, compileArguments, inspectInstalledBuiltin, replaceNativeBinary } from './rebuild-macos-builtin.mjs'

test('builtin rebuild sources and header archives are fixed to audited versions and hashes', () => {
  assert.equal(BUILTIN_SOURCE.version, '0.1.9')
  assert.match(BUILTIN_SOURCE.url, new RegExp(BUILTIN_SOURCE.commit + '$'))
  assert.equal(BUILTIN_SOURCE.sha256.length, 64)
  assert.equal(NODE_ADDON_API.version, '8.9.0')
  assert.equal(NODE_ADDON_API.sha256.length, 64)
})

test('compiler selects official NAPI sources and explicit Monterey Intel flags', () => {
  const binding = { targets: [{ target_name: 'require_builtin', sources: ['src/common.cc'], conditions: [
    ["narb_backend=='nodeabi'", { sources: ['src/nodeabi.cc'] }, { sources: ['src/napi.cc'] }],
  ] }] }
  const root = resolve('official-native')
  const args = compileArguments(binding, root, '/node/headers', '/api/headers', '/output.node')
  assert.deepEqual(args.slice(0, 3), ['-arch', 'x86_64', '-mmacosx-version-min=12.0'])
  assert.ok(args.includes('-DNARB_PRODUCT=1') && args.includes('-DNAPI_VERSION=9'))
  assert.ok(args.includes(join(root, 'src/napi.cc')))
  assert.ok(!args.includes(join(root, 'src/nodeabi.cc')))
  binding.targets[0].sources = ['../outside.cc']
  assert.throws(() => compileArguments(binding, root, '', '', ''), /escaped/)
})

test('minimum-OS checks ignore the SDK and reject newer actual load commands', () => {
  assert.deepEqual(assertMacOS12('cmd LC_BUILD_VERSION\n platform 1\n minos 12.0\n sdk 15.0'), ['12.0'])
  assert.deepEqual(assertMacOS12('cmd LC_VERSION_MIN_MACOSX\n version 11.0\n sdk 15.0'), ['11.0'])
  assert.throws(() => assertMacOS12('cmd LC_BUILD_VERSION\n minos 15.0\n sdk 15.0'), /still requires macOS 15/)
  assert.throws(() => assertMacOS12('cmd LC_BUILD_VERSION\n sdk 12.0'), /no minimum/)
})

test('standalone rebuilt addon permits system dylibs and rejects runner-only dependencies', () => {
  const listing = '/tmp/require_builtin.node:\n' +
    '\t/usr/lib/libc++.1.dylib (compatibility version 1.0.0, current version 1700.0.0)\n' +
    '\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1345.0.0)\n'
  assert.deepEqual(assertSystemDylibs(listing), ['/usr/lib/libc++.1.dylib', '/usr/lib/libSystem.B.dylib'])
  for (const library of ['/opt/homebrew/lib/libexample.dylib', '@rpath/libexample.dylib']) {
    assert.throws(() => assertSystemDylibs(listing + `\t${library} (compatibility version 1.0.0, current version 1.0.0)\n`), /non-system library/)
  }
  assert.throws(() => assertSystemDylibs('/tmp/require_builtin.node:\n'), /list is missing/)
})

test('replacement breaks pnpm hard links without modifying the original store binary', t => {
  const root = mkdtempSync(join(tmpdir(), 'builtin-replace-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const store = join(root, 'store.node'), installed = join(root, 'installed.node'), built = join(root, 'built.node')
  writeFileSync(store, 'original macOS15 binary')
  linkSync(store, installed)
  writeFileSync(built, 'rebuilt macOS12 binary')
  replaceNativeBinary(built, installed)
  assert.equal(readFileSync(installed, 'utf8'), 'rebuilt macOS12 binary')
  assert.equal(readFileSync(store, 'utf8'), 'original macOS15 binary')
})

test('installed entry and native package must retain the locked 0.1.9 identity', t => {
  const root = mkdtempSync(join(tmpdir(), 'builtin-identity-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const entry = join(root, 'node_modules/node-addon-require-builtin')
  const native = join(root, 'node_modules/node-addon-require-builtin-darwin-x64')
  mkdirSync(entry, { recursive: true }); mkdirSync(join(native, 'prebuilt'), { recursive: true })
  writeFileSync(join(entry, 'package.json'), JSON.stringify({ name: 'node-addon-require-builtin', version: '0.1.9' }))
  const manifest = join(native, 'package.json')
  writeFileSync(manifest, JSON.stringify({ name: 'node-addon-require-builtin-darwin-x64', version: '0.1.9' }))
  writeFileSync(join(native, 'prebuilds.json'), JSON.stringify({ platform: 'darwin-x64', binaries: [
    { backend: 'napi', abi: 'napi-v9', path: 'prebuilt/darwin-x64-napi-v9.node' },
  ] }))
  const binary = join(native, 'prebuilt/darwin-x64-napi-v9.node')
  writeFileSync(binary, 'native fixture')
  assert.equal(inspectInstalledBuiltin(root).binary, realpathSync(binary))
  writeFileSync(manifest, JSON.stringify({ name: 'node-addon-require-builtin-darwin-x64', version: '0.1.8' }))
  assert.throws(() => inspectInstalledBuiltin(root), /0\.1\.8/)
})
