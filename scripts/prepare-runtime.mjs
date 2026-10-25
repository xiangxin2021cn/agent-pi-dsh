#!/usr/bin/env node
// Cross-platform runtime staging for the Agent Pi DSH desktop shell.
// Assembles apps/desktop/runtime/{node,product,deepseek-harness} from a
// payload checkout on macOS/Linux CI (Windows keeps prepare-win-runtime.ps1,
// whose robocopy/junction path is faster on NTFS).
//
// Usage:
//   node prepare-runtime.mjs --dsh <dshDir> --product <productDir> \
//     --node-dir <official-node-archive-dir> --pnpm-dir <verified-pnpm-package> --out <runtimeDir>
//
// The dsh tree must already contain built lib/ output, apps/web/dist, and a
// platform-correct node_modules (run `pnpm install --prod` in it first).
// The product must include the pinned Office plugin with target-platform
// dependencies installed by install-univer-runtime-deps.mjs.

import { cpSync, existsSync, mkdirSync, rmSync, statSync, chmodSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dshBuildReceiptName, verifyDshBuildReceipt } from './dsh-build-receipt.mjs'
import { verifyDshRuntime } from './verify-dsh-runtime.mjs'
import { verifyProjectPlanRuntime } from './verify-project-plan-runtime.mjs'
import { assertUniverPublicReleaseTree } from './univer-public-release.mjs'

export function stageNodeRuntime(nodeArchiveDir, pnpmPackageDir, nodeDir, packageManager) {
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
  const npmSource = join(resolve(nodeArchiveDir), 'lib/node_modules/npm')
  const pnpmSource = resolve(pnpmPackageDir)
  const sourceNode = join(resolve(nodeArchiveDir), 'bin', nodeName)
  const sourceLicense = join(resolve(nodeArchiveDir), 'LICENSE')
  const npm = JSON.parse(readFileSync(join(npmSource, 'package.json'), 'utf8'))
  const pnpm = JSON.parse(readFileSync(join(pnpmSource, 'package.json'), 'utf8'))
  if (npm.name !== 'npm' || npm.version !== '11.19.1') throw new Error('Official Node archive must contain npm@11.19.1')
  if (pnpm.name !== 'pnpm' || `pnpm@${pnpm.version}` !== packageManager) throw new Error('pnpm differs from the official DSH packageManager pin')
  for (const file of [sourceNode, sourceLicense, join(npmSource, 'bin/npm-cli.js'), join(npmSource, 'bin/npx-cli.js'), join(pnpmSource, 'bin/pnpm.cjs'), join(pnpmSource, 'bin/pnpx.cjs')]) {
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`Node package manager input missing: ${file}`)
  }
  if (existsSync(nodeDir)) rmSync(nodeDir, { recursive: true, force: true })
  mkdirSync(join(nodeDir, 'node_modules'), { recursive: true })
  const node = join(nodeDir, nodeName)
  copyFileSync(sourceNode, node)
  copyFileSync(sourceLicense, join(nodeDir, 'LICENSE'))
  chmodSync(node, 0o755)
  for (const [name, source] of [['npm', npmSource], ['pnpm', pnpmSource]]) {
    cpSync(source, join(nodeDir, 'node_modules', name), { recursive: true, verbatimSymlinks: true })
  }
  for (const [name, cli] of [['npm', 'npm/bin/npm-cli.js'], ['npx', 'npm/bin/npx-cli.js'], ['pnpm', 'pnpm/bin/pnpm.cjs'], ['pnpx', 'pnpm/bin/pnpx.cjs']]) {
    const shim = join(nodeDir, name)
    writeFileSync(shim, `#!/bin/sh\nbasedir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$basedir/${nodeName}" "$basedir/node_modules/${cli}" "$@"\n`)
    chmodSync(shim, 0o755)
  }
  for (const [name, version, cli] of [['npm', npm.version, 'npm/bin/npm-cli.js'], ['pnpm', pnpm.version, 'pnpm/bin/pnpm.cjs']]) {
    const result = spawnSync(node, [join(nodeDir, 'node_modules', cli), '--version'], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0 || result.stdout.trim() !== version) throw new Error(`Bundled ${name} does not start at its pinned version: ${result.error?.message || result.stderr || result.stdout}`)
  }
  return node
}

export function main(args = process.argv.slice(2)) {
function arg(name) {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? null : args[index + 1]
}
const dshSrc = arg('dsh')
const productSrc = arg('product')
const nodeArchiveDir = arg('node-dir')
const pnpmPackageDir = arg('pnpm-dir')
const out = arg('out')

if (!dshSrc || !productSrc || !nodeArchiveDir || !pnpmPackageDir || !out) {
  throw new Error('usage: prepare-runtime.mjs --dsh <dir> --product <dir> --node-dir <official-node-archive-dir> --pnpm-dir <verified-pnpm-package> --out <runtimeDir>')
}

const dsh = resolve(dshSrc)
const product = resolve(productSrc)
const runtime = resolve(out)

const dshMarkers = [
  'package.json',
  'apps/web/dist/index.html',
  'apps/cli/lib/bin.js',
  // Workspace layout: a --prod install links @deepseek-ai packages under each
  // consumer (apps/cli), not the repo root, and .pnpm is the virtual store.
  'node_modules/.pnpm',
  'apps/cli/node_modules/@deepseek-ai',
]
const missing = dshMarkers.filter((rel) => !existsSync(join(dsh, rel)))
if (missing.length > 0) {
  console.error(`dsh tree incomplete under ${dsh}:\n${missing.join('\n')}`)
  console.error('build web dist + lib first, then run: pnpm install --prod --frozen-lockfile')
  process.exit(1)
}
if (!existsSync(join(product, 'package.json'))) {
  console.error(`product tree missing package.json under ${product}`)
  process.exit(1)
}
assertUniverPublicReleaseTree(product)
verifyProjectPlanRuntime(product)
verifyDshBuildReceipt({
  dshRoot: dsh,
  productRoot: product,
  receiptPath: join(dsh, dshBuildReceiptName),
})

mkdirSync(runtime, { recursive: true })

const stagedNode = stageNodeRuntime(nodeArchiveDir, pnpmPackageDir, join(runtime, 'node'), JSON.parse(readFileSync(join(dsh, 'package.json'), 'utf8')).packageManager)
console.log(`node runtime with pinned npm and pnpm -> ${stagedNode}`)

function stage(label, src, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  // verbatimSymlinks keeps pnpm's relative node_modules links intact; following
  // them would explode the tree into a multi-gigabyte duplicate.
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true })
  console.log(`${label} -> ${dest}`)
}

stage('product', product, join(runtime, 'product'))
stage('deepseek-harness', dsh, join(runtime, 'deepseek-harness'))
assertUniverPublicReleaseTree(join(runtime, 'product'))
verifyProjectPlanRuntime(join(runtime, 'product'))
verifyDshBuildReceipt({
  dshRoot: join(runtime, 'deepseek-harness'),
  productRoot: join(runtime, 'product'),
  receiptPath: join(runtime, 'deepseek-harness', dshBuildReceiptName),
})
verifyDshRuntime(join(runtime, 'deepseek-harness'), join(runtime, 'product'))

// Smoke-check the staged tree the same way the packaged app will.
const staged = join(runtime, 'deepseek-harness')
for (const rel of dshMarkers) {
  if (!existsSync(join(staged, rel))) {
    console.error(`staged runtime lost ${rel}; symlink-preserving copy failed`)
    process.exit(1)
  }
}
if (!existsSync(stagedNode) || !(statSync(stagedNode).mode & 0o111) && process.platform !== 'win32') {
  console.error(`staged node binary missing or not executable: ${stagedNode}`)
  process.exit(1)
}
console.log(`runtime staged at ${runtime}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
