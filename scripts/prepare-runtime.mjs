#!/usr/bin/env node
// Cross-platform runtime staging for the Agent Pi DSH desktop shell.
// Assembles apps/desktop/runtime/{node,product,deepseek-harness} from a
// payload checkout on macOS/Linux CI (Windows keeps prepare-win-runtime.ps1,
// whose robocopy/junction path is faster on NTFS).
//
// Usage:
//   node prepare-runtime.mjs --dsh <dshDir> --product <productDir> \
//     --node-bin <path-to-node-binary> --out <runtimeDir>
//
// The dsh tree must already contain built lib/ output, apps/web/dist, and a
// platform-correct node_modules (run `pnpm install --prod` in it first).

import { cpSync, existsSync, mkdirSync, rmSync, statSync, chmodSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { dshBuildReceiptName, verifyDshBuildReceipt } from './dsh-build-receipt.mjs'
import { verifyDshRuntime } from './verify-dsh-runtime.mjs'

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

const dshSrc = arg('dsh')
const productSrc = arg('product')
const nodeBin = arg('node-bin')
const out = arg('out')

if (!dshSrc || !productSrc || !out) {
  console.error('usage: prepare-runtime.mjs --dsh <dir> --product <dir> [--node-bin <file>] --out <runtimeDir>')
  process.exit(2)
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
verifyDshBuildReceipt({
  dshRoot: dsh,
  productRoot: product,
  receiptPath: join(dsh, dshBuildReceiptName),
})

mkdirSync(runtime, { recursive: true })

// node runtime: single executable on POSIX (node.exe + DLLs stay a Windows concern)
if (nodeBin) {
  const nodeDir = join(runtime, 'node')
  mkdirSync(nodeDir, { recursive: true })
  const dest = join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node')
  copyFileSync(resolve(nodeBin), dest)
  if (process.platform !== 'win32') chmodSync(dest, 0o755)
  console.log(`node runtime -> ${dest}`)
}

function stage(label, src, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  // verbatimSymlinks keeps pnpm's relative node_modules links intact; following
  // them would explode the tree into a multi-gigabyte duplicate.
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true })
  console.log(`${label} -> ${dest}`)
}

stage('product', product, join(runtime, 'product'))
stage('deepseek-harness', dsh, join(runtime, 'deepseek-harness'))
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
const stagedNode = join(runtime, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
if (nodeBin && (!existsSync(stagedNode) || !(statSync(stagedNode).mode & 0o111) && process.platform !== 'win32')) {
  console.error(`staged node binary missing or not executable: ${stagedNode}`)
  process.exit(1)
}
console.log(`runtime staged at ${runtime}`)
