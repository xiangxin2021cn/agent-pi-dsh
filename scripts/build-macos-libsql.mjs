import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  defaultUniverRuntimeLockPath, loadNativeRuntimePackages, productionRuntimeManifest,
  validateUniverRuntimeLock, verifyUniverRuntimeReceipt, writeUniverRuntimeReceipt,
} from './install-univer-runtime-deps.mjs'

export const libsqlMontereySource = Object.freeze({
  repository: 'https://github.com/tursodatabase/libsql-js.git',
  tag: 'v0.5.29', commit: '55bee86d1c284f1ddf2b9e280e870d2b6cef884a',
  version: '0.5.29', rust: '1.85.1', target: 'x86_64-apple-darwin', minimumMacOS: '12.0',
})

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')

export function assertLibsqlPackageVersions(pluginDir) {
  const plugin = resolve(pluginDir)
  const wrapper = readJson(join(plugin, 'node_modules/libsql/package.json'))
  const nativeDir = join(plugin, 'node_modules/@libsql/darwin-x64')
  const native = readJson(join(nativeDir, 'package.json'))
  if (readJson(join(plugin, 'package.json')).name !== 'dsh-univer-office'
    || wrapper.name !== 'libsql' || native.name !== '@libsql/darwin-x64'
    || wrapper.version !== libsqlMontereySource.version || native.version !== wrapper.version
    || native.main !== 'index.node') {
    throw new Error('Expected locked libsql and @libsql/darwin-x64 0.5.29 in the Office runtime')
  }
  return nativeDir
}

export function validateLibsqlMachO(architectures, commands) {
  if (architectures.trim() !== 'x86_64') throw new Error('libsql build must contain only the x86_64 slice')
  const versions = []
  for (const block of commands.split(/Load command \d+/)) {
    let match
    if (/\bcmd LC_BUILD_VERSION\b/.test(block)) {
      if (!/^\s*platform\s+(?:1|MACOS)\s*$/mi.test(block)) throw new Error('libsql build is not a macOS binary')
      match = block.match(/^\s*minos\s+(\d+(?:\.\d+){0,2})\s*$/m)
    } else if (/\bcmd LC_VERSION_MIN_MACOSX\b/.test(block)) {
      match = block.match(/^\s*version\s+(\d+(?:\.\d+){0,2})\s*$/m)
    } else continue
    if (!match) throw new Error('libsql minimum macOS version is missing')
    versions.push(match[1])
  }
  if (!versions.length) throw new Error('libsql minimum macOS version is missing')
  const tuple = version => version.split('.').map(Number).concat([0, 0]).slice(0, 3)
  const compare = (a, b) => { const right = tuple(b); return tuple(a).reduce((order, value, index) => order || value - right[index], 0) }
  const minimum = versions.sort(compare).at(-1)
  if (compare(minimum, libsqlMontereySource.minimumMacOS) > 0) throw new Error(`libsql requires macOS ${minimum}; expected 12.0 or older`)
  return minimum
}

export function validateLibsqlDynamicLibraries(libraries, commands) {
  const idBlock = commands.split(/Load command \d+/).find(block => /\bcmd LC_ID_DYLIB\b/.test(block))
  const installName = idBlock?.match(/^\s*name\s+(.+?)\s+\(offset \d+\)\s*$/m)?.[1]
  const dependencies = [...libraries.matchAll(/^\s+(.+?)\s+\(compatibility version .+$/gm)]
    .map(match => match[1]).filter(path => path !== installName)
  if (!dependencies.length) throw new Error('libsql dynamic dependency inventory is missing')
  for (const path of dependencies) {
    const normalized = posix.normalize(path)
    if (!normalized.startsWith('/usr/lib/') && !normalized.startsWith('/System/Library/Frameworks/')) {
      throw new Error(`libsql depends on a non-system dynamic library: ${path}`)
    }
  }
  return { installName, dependencies }
}

export function buildMacOSLibsql(pluginDir, buildDir) {
  if (process.platform !== 'darwin' || process.arch !== 'x64') throw new Error('libsql compatibility build requires Intel macOS')
  const plugin = resolve(pluginDir)
  const source = resolve(buildDir)
  const nativeDir = assertLibsqlPackageVersions(plugin)
  const manifest = readJson(join(plugin, 'package.json'))
  const dependencies = productionRuntimeManifest(manifest).dependencies
  const lock = validateUniverRuntimeLock(manifest, readJson(defaultUniverRuntimeLockPath))
  verifyUniverRuntimeReceipt(plugin, dependencies, lock)
  if (existsSync(source) && readdirSync(source).length) throw new Error('libsql source build directory must be empty')
  mkdirSync(source, { recursive: true })
  const run = (command, args, env = process.env, capture = false) => {
    const result = spawnSync(command, args, { cwd: source, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: 16 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.status}`)
    return result.stdout?.trim()
  }
  run('git', ['init'])
  run('git', ['remote', 'add', 'origin', libsqlMontereySource.repository])
  run('git', ['fetch', '--depth=1', 'origin', libsqlMontereySource.commit])
  run('git', ['checkout', '--detach', 'FETCH_HEAD'])
  assert.equal(run('git', ['rev-parse', 'HEAD'], process.env, true), libsqlMontereySource.commit)
  assert.equal(readJson(join(source, 'package.json')).version, libsqlMontereySource.version)
  const cargoLockSha256 = digest(join(source, 'Cargo.lock'))
  const native = join(nativeDir, 'index.node')
  const originalSha256 = digest(native)
  run('rustup', ['toolchain', 'install', libsqlMontereySource.rust, '--profile', 'minimal', '--target', libsqlMontereySource.target])
  const clang = run('xcrun', ['--find', 'clang'], process.env, true)
  const env = {
    ...process.env, RUSTUP_TOOLCHAIN: libsqlMontereySource.rust,
    MACOSX_DEPLOYMENT_TARGET: '12.0', CMAKE_OSX_DEPLOYMENT_TARGET: '12.0',
    SDKROOT: run('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], process.env, true),
    LIBCLANG_PATH: resolve(dirname(clang), '../lib'),
    CFLAGS: `${process.env.CFLAGS || ''} -mmacosx-version-min=12.0`.trim(),
    CXXFLAGS: `${process.env.CXXFLAGS || ''} -mmacosx-version-min=12.0`.trim(),
    RUSTFLAGS: `${process.env.RUSTFLAGS || ''} -C link-arg=-mmacosx-version-min=12.0`.trim(),
  }
  const enabledFeatures = run('cargo', [`+${libsqlMontereySource.rust}`, 'tree', '--locked', '--target', libsqlMontereySource.target,
    '-e', 'features', '-i', 'libsql-ffi'], env, true)
  assert.match(enabledFeatures, /libsql-ffi feature "multiple-ciphers"/, 'preserve the upstream bundled SQLite3MultipleCiphers encryption feature')
  assert.doesNotMatch(readFileSync(join(source, 'Cargo.lock'), 'utf8'), /name = "openssl(?:-sys|-src)?"/, 'the pinned encryption backend must not acquire a dynamic OpenSSL dependency')
  run('cargo', [`+${libsqlMontereySource.rust}`, 'build', '--locked', '--release', '--target', libsqlMontereySource.target], env)
  assert.equal(digest(join(source, 'Cargo.lock')), cargoLockSha256, 'libsql Cargo.lock must remain unchanged')
  assert.equal(run('git', ['status', '--porcelain', '--untracked-files=no'], process.env, true), '', 'upstream libsql sources must remain unchanged')
  const binary = join(source, 'target', libsqlMontereySource.target, 'release/liblibsql_js.dylib')
  const loadCommands = run('otool', ['-arch', 'x86_64', '-l', binary], process.env, true)
  const minimumMacOS = validateLibsqlMachO(run('lipo', ['-archs', binary], process.env, true), loadCommands)
  const dynamicLibraries = validateLibsqlDynamicLibraries(run('otool', ['-arch', 'x86_64', '-L', binary], process.env, true), loadCommands)
  const provenance = {
    schemaVersion: 1, package: '@libsql/darwin-x64', ...libsqlMontereySource,
    cargoLockSha256, originalSha256, rebuiltSha256: digest(binary), minimumMacOS, enabledFeatures,
    dynamicLibraries,
    rustc: run('rustc', [`+${libsqlMontereySource.rust}`, '--version'], env, true),
    clang: run('xcrun', ['clang', '--version'], env, true),
    deployment: { MACOSX_DEPLOYMENT_TARGET: env.MACOSX_DEPLOYMENT_TARGET, CMAKE_OSX_DEPLOYMENT_TARGET: env.CMAKE_OSX_DEPLOYMENT_TARGET,
      CFLAGS: env.CFLAGS, CXXFLAGS: env.CXXFLAGS, RUSTFLAGS: env.RUSTFLAGS },
    note: 'Same-version source build; existing Office and libsql JavaScript packages are unchanged.',
  }
  copyFileSync(binary, native)
  const require = createRequire(join(plugin, 'package.json'))
  const Database = require('libsql')
  const databaseFile = join(source, 'office-libsql-encryption-smoke.db')
  const options = { encryptionKey: 'agent-pi-compatibility-fixture-key' }
  const database = new Database(databaseFile, options)
  try {
    database.exec('CREATE TABLE compatibility (id INTEGER PRIMARY KEY, value TEXT)')
    database.prepare('INSERT INTO compatibility VALUES (?, ?)').run(1, 'office-ready')
    assert.throws(() => database.transaction(() => {
      database.prepare('INSERT INTO compatibility VALUES (?, ?)').run(2, 'rolled-back')
      throw new Error('rollback fixture')
    })(), /rollback fixture/)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM compatibility').get().count, 1)
  } finally { database.close() }
  const reopened = new Database(databaseFile, options)
  try { assert.equal(reopened.prepare('SELECT value FROM compatibility WHERE id = ?').get(1).value, 'office-ready') }
  finally { reopened.close() }
  const archive = join(nativeDir, 'libsql-js-0.5.29-source.tar.gz')
  run('git', ['archive', '--format=tar.gz', '--prefix=libsql-js-0.5.29/', '-o', archive, 'HEAD'])
  provenance.sourceArchiveSha256 = digest(archive)
  copyFileSync(join(source, 'LICENSE'), join(nativeDir, 'LIBSQL-SOURCE-LICENSE'))
  writeFileSync(join(nativeDir, 'LIBSQL-MONTEREY-BUILD.json'), JSON.stringify(provenance, null, 2) + '\n')
  writeUniverRuntimeReceipt(plugin, dependencies, lock)
  verifyUniverRuntimeReceipt(plugin, dependencies, lock)
  loadNativeRuntimePackages(plugin, dependencies, lock)
  return provenance
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: build-macos-libsql.mjs <Office-plugin-directory> <empty-source-build-directory>')
  console.log(JSON.stringify(buildMacOSLibsql(process.argv[2], process.argv[3]), null, 2))
}
