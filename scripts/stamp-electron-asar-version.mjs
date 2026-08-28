import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktopPkg = join(root, 'apps/desktop/package.json')
const require = createRequire(desktopPkg)
const asar = require('@electron/asar')

const unpacked = process.argv[2]
const wanted = process.argv[3] || JSON.parse(readFileSync(desktopPkg, 'utf8')).version
if (!unpacked || !wanted) {
  throw new Error('usage: stamp-electron-asar-version.mjs <win-unpacked-dir> [version]')
}

const archive = join(unpacked, 'resources/app.asar')
const mainSrc = join(root, 'apps/desktop/main.mjs')
const preloadSrc = join(root, 'apps/desktop/preload.cjs')
const current = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
const currentMain = asar.extractFile(archive, 'main.mjs')
let currentPreload
try {
  currentPreload = asar.extractFile(archive, 'preload.cjs')
} catch {
  currentPreload = Buffer.alloc(0)
}
const wantedMain = readFileSync(mainSrc)
const wantedPreload = readFileSync(preloadSrc)
const versionOk = current.version === wanted
const mainOk = Buffer.compare(currentMain, wantedMain) === 0
const preloadOk = Buffer.compare(currentPreload, wantedPreload) === 0
if (versionOk && mainOk && preloadOk) {
  process.stdout.write(`asar already ${wanted} with current main.mjs and preload.cjs\n`)
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), 'agent-pi-asar-'))
try {
  asar.extractAll(archive, dir)
  const manifestPath = join(dir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.version = wanted
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(dir, 'main.mjs'), wantedMain)
  rmSync(join(dir, 'preload.mjs'), { force: true })
  writeFileSync(join(dir, 'preload.cjs'), wantedPreload)
  await asar.createPackage(dir, archive)
  const stamped = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (stamped.version !== wanted) {
    throw new Error(`asar stamp failed: still ${stamped.version}`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

process.stdout.write(`asar ${current.version} -> ${wanted} (main.mjs synced)\n`)
