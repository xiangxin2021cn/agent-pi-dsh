import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { assertLibsqlPackageVersions, validateLibsqlDynamicLibraries, validateLibsqlMachO } from './build-macos-libsql.mjs'

test('libsql deployment check reads the actual minimum version rather than the newer SDK', () => {
  assert.equal(validateLibsqlMachO('x86_64', 'Load command 0\n cmd LC_BUILD_VERSION\n platform MACOS\n minos 12.0\n sdk 15.5\n'), '12.0')
  assert.equal(validateLibsqlMachO('x86_64', 'Load command 0\n cmd LC_VERSION_MIN_MACOSX\n version 11.0\n sdk 14.0\n'), '11.0')
})

test('libsql rejects newer minimum systems, foreign slices and absent deployment metadata', () => {
  assert.throws(() => validateLibsqlMachO('x86_64', 'Load command 0\n cmd LC_BUILD_VERSION\n platform 1\n minos 14.0\n sdk 15.5\n'), /requires macOS 14.0/)
  assert.throws(() => validateLibsqlMachO('arm64', ''), /x86_64 slice/)
  assert.throws(() => validateLibsqlMachO('x86_64', 'Load command 0\n cmd LC_BUILD_VERSION\n platform IOS\n minos 12.0\n'), /not a macOS binary/)
  assert.throws(() => validateLibsqlMachO('x86_64', ''), /minimum macOS version is missing/)
})

test('libsql dynamic closure accepts system libraries and distinguishes the dylib identity from a dependency', () => {
  const commands = 'Load command 0\n cmd LC_ID_DYLIB\n name /Users/runner/build/liblibsql_js.dylib (offset 24)\n'
  const libraries = '/Users/runner/build/liblibsql_js.dylib:\n'
    + '\t/Users/runner/build/liblibsql_js.dylib (compatibility version 0.0.0, current version 0.0.0)\n'
    + '\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1345.0.0)\n'
    + '\t/System/Library/Frameworks/Security.framework/Versions/A/Security (compatibility version 1.0.0, current version 61123.0.0)\n'
  assert.deepEqual(validateLibsqlDynamicLibraries(libraries, commands), {
    installName: '/Users/runner/build/liblibsql_js.dylib',
    dependencies: ['/usr/lib/libSystem.B.dylib', '/System/Library/Frameworks/Security.framework/Versions/A/Security'],
  })
})

test('libsql dynamic closure rejects runner-local, Homebrew and unresolved loader libraries', () => {
  for (const path of ['/usr/local/opt/openssl/lib/libcrypto.3.dylib', '/opt/homebrew/lib/libssl.3.dylib',
    '/Users/runner/build/libcrypto.dylib', '/usr/lib/../../opt/homebrew/lib/libcrypto.dylib',
    '@rpath/libcrypto.3.dylib', '@loader_path/libcrypto.3.dylib']) {
    assert.throws(() => validateLibsqlDynamicLibraries(`binding:\n\t${path} (compatibility version 1.0.0, current version 1.0.0)\n`, ''), /non-system dynamic library/)
  }
  assert.throws(() => validateLibsqlDynamicLibraries('binding:\n', ''), /inventory is missing/)
})

test('libsql replacement only accepts the matching locked Office wrapper and native package', t => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-libsql-source-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value)) }
  write(join(root, 'package.json'), { name: 'dsh-univer-office', version: '0.3.7' })
  write(join(root, 'node_modules/libsql/package.json'), { name: 'libsql', version: '0.5.29' })
  const native = join(root, 'node_modules/@libsql/darwin-x64')
  write(join(native, 'package.json'), { name: '@libsql/darwin-x64', version: '0.5.29', main: 'index.node' })
  assert.equal(assertLibsqlPackageVersions(root), native)
  write(join(native, 'package.json'), { name: '@libsql/darwin-x64', version: '0.5.28', main: 'index.node' })
  assert.throws(() => assertLibsqlPackageVersions(root), /Expected locked libsql/)
  write(join(native, 'package.json'), { name: '@libsql/darwin-arm64', version: '0.5.29', main: 'index.node' })
  assert.throws(() => assertLibsqlPackageVersions(root), /Expected locked libsql/)
})
