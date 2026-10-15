// Rebuild the locked 0.1.9 loader addon from unmodified official C++ sources.
// Only the Intel compatibility workflow calls this; package versions stay fixed.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const BUILTIN_SOURCE = Object.freeze({
  version: '0.1.9', commit: 'a58d3599a2e551d7d706d1ff796c9fd4bbaff63c',
  url: 'https://codeload.github.com/deepseek-ai/dsh-node-addon-require-builtin/tar.gz/a58d3599a2e551d7d706d1ff796c9fd4bbaff63c',
  sha256: '286616f15e4f12013988e45ad27a69b4968a9f059c8bd351e412505230577948',
})
export const NODE_ADDON_API = Object.freeze({
  version: '8.9.0', url: 'https://registry.npmjs.org/node-addon-api/-/node-addon-api-8.9.0.tgz',
  sha256: '19b87e2ce3a77fec0121ac97d7db088aae28aacfff481adab50d5f61b70e68f4',
})
const nativeName = 'node-addon-require-builtin-darwin-x64'
const binaryRelativePath = 'prebuilt/darwin-x64-napi-v9.node'
const sha256 = data => createHash('sha256').update(data).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))

function inside(root, path) {
  const child = relative(root, path)
  return child !== '' && !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep)
}

export function inspectInstalledBuiltin(dshDirectory) {
  const root = realpathSync(dshDirectory)
  const boot = createRequire(join(root, 'packages/boot/app-boot/package.json'))
  const entryManifest = realpathSync(boot.resolve('node-addon-require-builtin/package.json'))
  const entry = json(entryManifest)
  assert.equal(entry.name, 'node-addon-require-builtin')
  assert.equal(entry.version, BUILTIN_SOURCE.version)
  const platformManifest = realpathSync(createRequire(entryManifest).resolve(nativeName + '/package.json'))
  const platform = json(platformManifest)
  assert.equal(platform.name, nativeName)
  assert.equal(platform.version, BUILTIN_SOURCE.version)
  const metadata = json(join(dirname(platformManifest), 'prebuilds.json'))
  assert.equal(metadata.platform, 'darwin-x64')
  assert.ok(metadata.binaries.some(item => item.backend === 'napi' && item.abi === 'napi-v9' && item.path === binaryRelativePath))
  const binary = realpathSync(join(dirname(platformManifest), binaryRelativePath))
  assert.ok(inside(root, entryManifest) && inside(root, platformManifest) && inside(root, binary), 'Addon must be inside the staged DSH runtime')
  return { root, entryManifest, binary }
}

export function compileArguments(binding, nativeRoot, nodeHeaders, apiHeaders, output) {
  const target = binding.targets.find(item => item.target_name === 'require_builtin')
  assert.ok(target, 'Official require_builtin target is missing')
  const backend = target.conditions.find(item => item[0] === "narb_backend=='nodeabi'")
  assert.ok(backend?.[2]?.sources, 'Official NAPI source selection is missing')
  const sources = [...target.sources, ...backend[2].sources].map(name => {
    const source = resolve(nativeRoot, name)
    assert.ok(inside(nativeRoot, source), 'Native source escaped the official source directory')
    return source
  })
  return ['-arch', 'x86_64', '-mmacosx-version-min=12.0', '-bundle', '-undefined', 'dynamic_lookup',
    '-std=c++17', '-Wall', '-Wextra', '-Wno-unused-parameter', '-Wno-cast-function-type-mismatch',
    '-fno-exceptions', '-fvisibility=hidden', '-DNAPI_VERSION=9', '-DNARB_BACKEND=1', '-DNARB_PRODUCT=1',
    '-DNODE_ADDON_API_DISABLE_CPP_EXCEPTIONS', '-DNODE_GYP_MODULE_NAME=require_builtin',
    '-I', nodeHeaders, '-I', apiHeaders, ...sources, '-o', output]
}

export function assertMacOS12(commands) {
  const versions = commands.split(/Load command \d+/).flatMap(block => {
    const field = /\bcmd LC_BUILD_VERSION\b/.test(block) ? 'minos' : /\bcmd LC_VERSION_MIN_MACOSX\b/.test(block) ? 'version' : null
    const match = field && block.match(new RegExp(`\\b${field}\\s+(\\d+(?:\\.\\d+){0,2})`))
    return match ? [match[1]] : []
  })
  assert.ok(versions.length, 'Rebuilt addon has no minimum macOS load command')
  for (const value of versions) {
    const [major, minor = 0, patch = 0] = value.split('.').map(Number)
    assert.ok(major < 12 || (major === 12 && minor === 0 && patch === 0), `Rebuilt addon still requires macOS ${value}`)
  }
  return versions
}

export function assertSystemDylibs(listing) {
  const libraries = listing.split('\n').flatMap(line => {
    const match = line.match(/^\s+(.+?)\s+\(compatibility version /)
    return match ? [match[1]] : []
  })
  assert.ok(libraries.length, 'Rebuilt addon dynamic-library list is missing')
  for (const library of libraries) {
    assert.ok(library.startsWith('/usr/lib/') || library.startsWith('/System/Library/Frameworks/'),
      `Rebuilt addon depends on a non-system library: ${library}`)
  }
  return libraries
}

export function replaceNativeBinary(source, destination) {
  const pending = destination + '.agent-pi-monterey-pending'
  try {
    copyFileSync(source, pending, constants.COPYFILE_EXCL)
    // Replace the directory entry rather than mutate pnpm's store hard link.
    renameSync(pending, destination)
  } finally { if (existsSync(pending)) rmSync(pending) }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`)
  return result.stdout
}

async function unpackPinnedArchive(pin, directory, work) {
  const response = await fetch(pin.url)
  if (!response.ok) throw new Error(`Source download failed: ${response.status} ${pin.url}`)
  const data = Buffer.from(await response.arrayBuffer())
  assert.equal(sha256(data), pin.sha256, `Source checksum mismatch: ${pin.url}`)
  const archive = join(work, pin === BUILTIN_SOURCE ? 'builtin-source.tar.gz' : 'node-addon-api.tar.gz')
  writeFileSync(archive, data, { flag: 'wx' })
  mkdirSync(directory)
  run('tar', ['-xzf', archive, '-C', directory, '--strip-components=1'])
}

const smoke = `const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const entry=process.argv[1], direct=process.argv[2];
const addon=direct ? require(direct) : createRequire(entry)('node-addon-require-builtin');
const info=direct ? addon.getNativeBindingInfo() : addon.getBindingInfo();
const cjs=addon.requireBuiltin('internal/modules/cjs/loader');
const esm=addon.requireBuiltin('internal/modules/esm/loader');
const realm=addon.requireBuiltin('internal/bootstrap/realm');
assert.equal(typeof cjs.Module._resolveFilename,'function');
assert.equal(typeof esm.getOrInitializeCascadedLoader,'function');
assert.equal(typeof realm.internalBinding('modules').readPackageJSON,'function');
if(direct){assert.equal(info.product,'require-builtin');assert.equal(info.backend,'napi');assert.equal(info.abi,'napi-v9');}
console.log(JSON.stringify({requireBuiltin:true,node:process.versions.node,info}));`

export async function rebuildMacOSBuiltin(dshDirectory, reportPath) {
  assert.equal(process.platform, 'darwin', 'Only the Intel macOS build rebuilds this addon')
  assert.equal(process.arch, 'x64')
  assert.equal(process.versions.node, '22.20.0', 'Use the packaged Node version to build and probe the addon')
  const installed = inspectInstalledBuiltin(dshDirectory)
  const nodeHeaders = resolve(dirname(process.execPath), '../include/node')
  for (const header of ['node.h', 'node_api.h']) assert.ok(existsSync(join(nodeHeaders, header)), `Missing official Node header ${header}`)
  const work = mkdtempSync(join(tmpdir(), 'agent-pi-builtin-'))
  try {
    const source = join(work, 'source'), api = join(work, 'node-addon-api')
    await unpackPinnedArchive(BUILTIN_SOURCE, source, work)
    await unpackPinnedArchive(NODE_ADDON_API, api, work)
    assert.equal(json(join(source, 'package.json')).version, BUILTIN_SOURCE.version)
    assert.equal(json(join(api, 'package.json')).version, NODE_ADDON_API.version)
    const nativeRoot = join(source, 'packages/native'), output = join(work, 'require_builtin.node')
    const args = compileArguments(json(join(nativeRoot, 'binding.gyp')), nativeRoot, nodeHeaders, api, output)
    run('c++', args, { cwd: source, env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '12.0' } })
    assert.ok(run('lipo', ['-archs', output]).trim().split(/\s+/).includes('x86_64'), 'Rebuilt addon has no Intel slice')
    const minimumMacOS = assertMacOS12(run('otool', ['-arch', 'x86_64', '-l', output]))
    const dynamicLibraries = assertSystemDylibs(run('otool', ['-arch', 'x86_64', '-L', output]))
    const env = { ...process.env, NARB_DISABLE_NATIVE_CACHE: '1', NARB_DISABLE_LOCAL_BUILD: '1', NARB_DISABLE_OPTIONAL_PACKAGE: '0', NARB_BACKEND: 'napi' }
    const direct = JSON.parse(run(process.execPath, ['-e', smoke, installed.entryManifest, output], { env }))
    replaceNativeBinary(output, installed.binary)
    const packaged = JSON.parse(run(process.execPath, ['-e', smoke, installed.entryManifest], { env }))
    const notices = join(dirname(dirname(installed.binary)), 'monterey-build-licenses')
    mkdirSync(notices, { recursive: true })
    copyFileSync(join(source, 'LICENSE'), join(notices, 'require-builtin.LICENSE'))
    copyFileSync(join(api, 'LICENSE.md'), join(notices, 'node-addon-api.LICENSE.md'))
    const report = { package: nativeName, version: BUILTIN_SOURCE.version, source: BUILTIN_SOURCE,
      nodeAddonAPI: NODE_ADDON_API, node: process.versions.node, platform: process.platform, arch: process.arch,
      deploymentTarget: '12.0', minimumMacOS, dynamicLibraries, binary: relative(installed.root, installed.binary).split(sep).join('/'),
      binarySha256: sha256(readFileSync(installed.binary)), direct, packaged }
    mkdirSync(dirname(resolve(reportPath)), { recursive: true })
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
    return report
  } finally { rmSync(work, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dshIndex = process.argv.indexOf('--dsh'), reportIndex = process.argv.indexOf('--report')
  if (dshIndex === -1 || reportIndex === -1 || !process.argv[dshIndex + 1] || !process.argv[reportIndex + 1]) {
    throw new Error('Usage: rebuild-macos-builtin.mjs --dsh <installed-dsh-directory> --report <json-file>')
  }
  console.log(JSON.stringify(await rebuildMacOSBuiltin(process.argv[dshIndex + 1], process.argv[reportIndex + 1])))
}
