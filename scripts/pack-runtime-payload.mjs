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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'apps', 'desktop')
const version = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version
const outDirArgIndex = process.argv.indexOf('--out')
const outDir = outDirArgIndex !== -1 ? resolve(process.argv[outDirArgIndex + 1]) : join(root, 'release')
const stage = join(desktop, 'dist-payload', 'stage')
const tarName = `runtime-payload-${version}.tar.gz`

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${result.status}`)
  }
}

run(process.execPath, [join(root, 'scripts', 'apply-dsh-patches.mjs')])

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

// 1. desktop shell (whitelist: only what electron-builder needs)
const desktopDest = join(stage, 'desktop')
mkdirSync(join(desktopDest, 'build'), { recursive: true })
for (const file of ['main.mjs', 'codex-auth.mjs', 'codex-models.mjs', 'compaction-preferences.mjs', 'preload.cjs', 'boot.html', 'after-pack.cjs', 'package.json']) {
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
  'package.json', 'README.md', 'DSH_PIN', '.gitmodules',
  'vendor/dsh-super-injector', 'vendor/dsh-router-standard', 'vendor/dshmarket',
  'vendor/anysearch-dsh',
  'vendor/dsh-univer-office',
  'vendor/README.md', 'vendor/dsh-super-injector.pin',
  'vendor/anysearch-dsh.pin', 'vendor/dsh-univer-office.pin',
]
for (const item of productItems) {
  const src = join(root, item)
  if (!existsSync(src)) continue
  const dest = join(productDest, item)
  if (statSync(src).isDirectory()) {
    // node_modules stay out; CI installs per-platform dependencies.
    robocopy(src, dest, ['/XD', 'node_modules', '.git'])
  } else {
    mkdirSync(join(dest, '..'), { recursive: true })
    cpSync(src, dest)
  }
}
console.log('staged product tree')

// 3. deepseek-harness source + built artifacts (no node_modules)
const dshSrc = join(root, 'vendor', 'deepseek-harness')
const dshDest = join(stage, 'deepseek-harness')
robocopy(dshSrc, dshDest, [
  '/XD', 'node_modules', '.git', 'website', 'docs', '.agents', '.github',
  'coverage', '.turbo', '.cache', '.claude', '.reasonix', '.agent-pi',
  '/XF', '*.map', '*.tsbuildinfo',
])
for (const marker of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web/dist/index.html', 'apps/cli/lib/bin.js']) {
  if (!existsSync(join(dshDest, marker))) throw new Error(`payload dsh tree missing ${marker}`)
}
console.log('staged deepseek-harness')

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
