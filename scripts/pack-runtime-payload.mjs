#!/usr/bin/env node
// Builds the platform-neutral runtime payload used by GitHub Actions to
// assemble macOS/Linux desktop packages. The payload travels as a release asset:
//   desktop/           Electron shell (main.mjs, preload, brand, builder config)
//   product/           skills/knowledge/bundles/packages/scripts trees
//   deepseek-harness/  DSH source + built lib + web dist (NO node_modules;
//                      CI runs pnpm install --prod for the target platform)
//
// Usage: node scripts/pack-runtime-payload.mjs [--out <dir>]

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyCadCleanRelease } from './cad-clean-release.mjs'
import {
  buildDshWithReceipt,
  dshBuildReceiptName,
  dshRuntimeFilePolicy,
  verifyDshBuildReceipt,
} from './dsh-build-receipt.mjs'
import { verifyDshRuntime } from './verify-dsh-runtime.mjs'
import { verifyRuntimePayloadStage } from './verify-runtime-payload-stage.mjs'
import {
  assertUniverPublicReleaseTree,
  removeBundledUniverFromProduct,
} from './univer-public-release.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'apps', 'desktop')
const version = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version
const outDirArgIndex = process.argv.indexOf('--out')
const outDir = outDirArgIndex !== -1 ? resolve(process.argv[outDirArgIndex + 1]) : join(root, 'release')
const cadOutputArgIndex = process.argv.indexOf('--cad-clean-output')
const cadCleanOutputValue = cadOutputArgIndex !== -1
  ? process.argv[cadOutputArgIndex + 1]
  : process.env.AGENT_PI_CAD_CLEAN_OUTPUT || join(root, '.codex-temp', 'cad-clean-output')
if (!cadCleanOutputValue) throw new Error('--cad-clean-output requires a directory')
const cadCleanOutput = resolve(cadCleanOutputValue)
const stage = join(desktop, 'dist-payload', 'stage')
const tarName = `runtime-payload-${version}.tar.gz`
const cadViewer = join(cadCleanOutput, 'cad-viewer')
const cadSourceName = `Agent-Pi-DSH-${version}-CAD-corresponding-source.tar.gz`
const cadSourceArchive = join(cadCleanOutput, cadSourceName)
const cadSourceChecksum = `${cadSourceArchive}.sha256`
const fallbackFontSha256 = 'e2bc8a2e7f37474b774fff8db758681ece40bb6947a90d571bce9dd60671a8e4'
const dshBuildReceipt = join(root, '.codex-temp', 'dsh-build', dshBuildReceiptName)

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${result.status}`)
  }
}

function listFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function verifyCadViewerAssets(dir, label) {
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`${label} CAD viewer missing index.html`)
  const files = listFiles(dir)
  const names = new Set(files.map((file) => file.split(/[\\/]/).at(-1)))
  const workerNames = new Set(['libredwg-parser-worker.js', 'mtext-renderer-worker.js'])
  const hasMainJs = files.some((file) => file.endsWith('.js') && !workerNames.has(file.split(/[\\/]/).at(-1)))
  const fallbackFont = join(dir, 'resources', 'fonts', 'SourceHanSansCN-Regular.otf')
  const required = [
    ['JavaScript bundle', hasMainJs],
    ['CSS bundle', files.some((file) => file.endsWith('.css'))],
    ['libredwg-parser-worker.js', names.has('libredwg-parser-worker.js')],
    ['libredwg-web.wasm', names.has('libredwg-web.wasm')],
    ['mtext-renderer-worker.js', names.has('mtext-renderer-worker.js')],
    ['CAD-CLEAN-BUILD.json', existsSync(join(dir, 'CAD-CLEAN-BUILD.json'))],
    ['LICENSE-BOUNDARY.md', existsSync(join(dir, 'LICENSE-BOUNDARY.md'))],
    ['THIRD_PARTY_NOTICES.md', existsSync(join(dir, 'THIRD_PARTY_NOTICES.md'))],
    ['licenses/mlightcad-cad-simple-viewer-LICENSE', existsSync(join(dir, 'licenses', 'mlightcad-cad-simple-viewer-LICENSE'))],
    ['licenses/mlightcad-libredwg-converter-LICENSE', existsSync(join(dir, 'licenses', 'mlightcad-libredwg-converter-LICENSE'))],
    ['licenses/GPL-3.0.txt', existsSync(join(dir, 'licenses', 'GPL-3.0.txt'))],
    ['GPL-3.0 license text', existsSync(join(dir, 'licenses', 'GPL-3.0.txt')) && readFileSync(join(dir, 'licenses', 'GPL-3.0.txt'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE')],
    ['resources/fonts/fonts.json', existsSync(join(dir, 'resources', 'fonts', 'fonts.json'))],
    ['SourceHanSansCN-Regular.otf', existsSync(fallbackFont)],
    ['Source Han Sans CN SHA256', existsSync(fallbackFont) && createHash('sha256').update(readFileSync(fallbackFont)).digest('hex') === fallbackFontSha256],
    ['resources/fonts/OFL-1.1.txt', existsSync(join(dir, 'resources', 'fonts', 'OFL-1.1.txt'))],
    ['licenses/SourceHanSansCN-OFL-1.1.txt', existsSync(join(dir, 'licenses', 'SourceHanSansCN-OFL-1.1.txt'))],
  ]
  const missing = required.filter(([, found]) => !found).map(([name]) => name)
  if (missing.length) throw new Error(`${label} CAD viewer missing: ${missing.join(', ')}`)
}

run(process.execPath, [join(root, 'scripts', 'kernel-version-policy.mjs'), '--history'])
run(process.execPath, [join(root, 'scripts', 'apply-dsh-patches.mjs')])
const dshSrc = realpathSync(join(root, 'vendor', 'deepseek-harness'))
buildDshWithReceipt({ dshRoot: dshSrc, productRoot: root, receiptPath: dshBuildReceipt })
verifyDshBuildReceipt({
  dshRoot: dshSrc,
  productRoot: root,
  receiptPath: dshBuildReceipt,
  requireGit: true,
})
verifyCadCleanRelease({
  archivePath: cadSourceArchive,
  checksumPath: cadSourceChecksum,
  runtimeDir: cadViewer,
})
verifyCadViewerAssets(cadViewer, 'source')

function robocopy(src, dest, extra = []) {
  const result = spawnSync('robocopy', [
    src, dest, '/E', '/SL', '/MT:16', '/R:1', '/W:1',
    '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np',
    ...extra,
  ], { windowsHide: true })
  const code = result.status ?? 1
  if (code >= 8) throw new Error(`robocopy failed (${code}) ${src} -> ${dest}`)
}

console.log(`payload version ${version}`)
if (existsSync(stage)) rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
mkdirSync(outDir, { recursive: true })
for (const sourcePath of [cadSourceArchive, cadSourceChecksum]) {
  const target = join(outDir, sourcePath.endsWith('.sha256') ? `${cadSourceName}.sha256` : cadSourceName)
  if (resolve(sourcePath) !== resolve(target)) cpSync(sourcePath, target)
}

// 1. desktop shell (whitelist: only what electron-builder needs)
const desktopDest = join(stage, 'desktop')
mkdirSync(join(desktopDest, 'build'), { recursive: true })
for (const file of ['main.mjs', 'dsh-web-url.mjs', 'codex-auth.mjs', 'codex-models.mjs', 'compaction-preferences.mjs', 'preload.cjs', 'boot.html', 'after-pack.cjs', 'package.json', 'package-lock.json']) {
  cpSync(join(desktop, file), join(desktopDest, file))
}
cpSync(join(desktop, 'brand'), join(desktopDest, 'brand'), { recursive: true })
// electron-builder mac icns generation wants >=512px; ship the 2048px master.
const iconMaster = join(root, 'AgentPI-logo-2.png')
cpSync(existsSync(iconMaster) ? iconMaster : join(desktop, 'brand', 'app-icon.png'), join(desktopDest, 'build', 'icon.png'))
console.log('staged desktop shell')

// 2. product tree (same manifest as prepare-win-runtime.ps1)
const productDest = join(stage, 'product')
const productItems = [
  'skills', 'knowledge', 'bundles', 'packages', 'scripts',
  'package.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'DSH_PIN', '.gitmodules',
  'vendor/dsh-super-injector', 'vendor/dsh-router-standard', 'vendor/dshmarket',
  'vendor/anysearch-dsh',
  'vendor/README.md', 'vendor/dsh-super-injector.pin', 'vendor/dsh-router-standard.pin',
  'vendor/anysearch-dsh.pin',
]
for (const item of productItems) {
  const src = join(root, item)
  if (!existsSync(src)) continue
  const dest = join(productDest, item)
  if (statSync(src).isDirectory()) {
    // node_modules stay out; CI installs per-platform dependencies.
    robocopy(src, dest, ['/XD', 'node_modules', '.git', '/XF', '.git'])
  } else {
    mkdirSync(join(dest, '..'), { recursive: true })
    cpSync(src, dest)
  }
}
removeBundledUniverFromProduct(productDest)
assertUniverPublicReleaseTree(productDest)
const stagedCadViewer = join(productDest, 'bundles', 'tender-web', 'lib', 'cad-viewer')
rmSync(stagedCadViewer, { recursive: true, force: true })
mkdirSync(dirname(stagedCadViewer), { recursive: true })
cpSync(cadViewer, stagedCadViewer, { recursive: true })
verifyCadCleanRelease({
  archivePath: cadSourceArchive,
  checksumPath: cadSourceChecksum,
  runtimeDir: stagedCadViewer,
})
verifyCadViewerAssets(stagedCadViewer, 'staged runtime')
console.log('staged product tree')

// 3. deepseek-harness source + built artifacts (no node_modules)
const dshDest = join(stage, 'deepseek-harness')
robocopy(dshSrc, dshDest, [
  '/XD', ...dshRuntimeFilePolicy.excludedDirectoryNames,
  '/XF', ...dshRuntimeFilePolicy.excludedFileNames, ...dshRuntimeFilePolicy.excludedFileGlobs,
])
cpSync(dshBuildReceipt, join(dshDest, dshBuildReceiptName))
for (const marker of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web/dist/index.html', 'apps/cli/lib/bin.js']) {
  if (!existsSync(join(dshDest, marker))) throw new Error(`payload dsh tree missing ${marker}`)
}
console.log('staged deepseek-harness')
verifyDshBuildReceipt({
  dshRoot: dshDest,
  productRoot: productDest,
  receiptPath: join(dshDest, dshBuildReceiptName),
})
verifyDshRuntime(dshDest, productDest)
verifyRuntimePayloadStage(stage)
console.log('verified portable payload stage')

// 4. tarball (bsdtar ships with Windows 10+)
const tarPath = join(outDir, tarName)
if (existsSync(tarPath)) rmSync(tarPath)
run('tar', ['-czf', tarPath, '-C', stage, 'desktop', 'product', 'deepseek-harness'])

const bytes = readFileSync(tarPath)
const sha = createHash('sha256').update(bytes).digest('hex')
writeFileSync(`${tarPath}.sha256`, `${sha}  ${tarName}\n`)
console.log(`payload: ${tarPath}`)
console.log(`size: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
console.log(`sha256: ${sha}`)
