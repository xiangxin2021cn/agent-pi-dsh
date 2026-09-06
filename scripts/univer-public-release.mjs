import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadUniverPin } from './materialize-dsh-univer-office.mjs'
import { verifyInstalledUniverProduct } from './installer-univer-lifecycle.mjs'

export function assertUniverPublicReleaseTree(rootPath, { runtime = true } = {}) {
  const root = resolve(rootPath)
  const pin = loadUniverPin(join(root, 'vendor/dsh-univer-office.pin'))
  const plugin = join(root, 'vendor/dsh-univer-office')
  // Preserve the complete official plugin, including upstream runtime licenses.
  const verified = verifyInstalledUniverProduct(root, { required: runtime })
  if (!verified.present) throw new Error('public release is missing the required official dsh-univer-office plugin')
  const receipt = JSON.parse(readFileSync(join(plugin, 'AGENT-PI-VENDOR-RECEIPT.json'), 'utf8'))
  assert.deepEqual(receipt.package, { name: pin.name, version: pin.version, license: pin.license }, 'Office package identity differs from its pin')
  assert.deepEqual(receipt.source, pin.source, 'Office source identity differs from its pin')
  assert.deepEqual(receipt.tarball, {
    url: pin.tarball, integrity: pin.integrity, shasum: pin.shasum,
    bytes: pin.archiveBytes, entries: pin.archiveEntries,
  }, 'Office tarball identity differs from its pin')
  const patch = readFileSync(join(root, 'scripts/patch-univer-alpha1.mjs'))
  assert.equal(receipt.compatibilityPatch?.sha256, createHash('sha256').update(patch).digest('hex'), 'Office compatibility patch is stale')
  const license = readFileSync(join(plugin, 'LICENSE'), 'utf8')
  if (!license.includes('Apache License') || !license.includes('Version 2.0, January 2004')) {
    throw new Error('official Office Apache-2.0 license text is missing')
  }
  return root
}

function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('cannot inspect Office release archive: ' + (result.stderr || result.status))
  return result.stdout
}

export function assertUniverPublicReleaseArchive(archivePath) {
  const archive = resolve(archivePath)
  const entries = tar(['-tf', archive]).split(/\r?\n/).filter(Boolean)
  const verbose = tar(['-tvf', archive]).split(/\r?\n/).filter(Boolean)
  assert.equal(entries.length, verbose.length, 'Office archive listings disagree')
  const normalize = value => value.replace(/^\.\//, '').replace(/\/$/, '')
  const roots = ['product/vendor/dsh-univer-office', 'product/vendor/dsh-univer-office.pin', 'product/scripts/patch-univer-alpha1.mjs']
  const selected = roots.map(path => {
    const entry = entries.find(item => normalize(item) === path)
    if (!entry) throw new Error('public release archive is missing required Office input: ' + path)
    return entry
  })
  entries.forEach((entry, index) => {
    const path = normalize(entry)
    if (!roots.some(root => path === root || path.startsWith(root + '/'))) return
    if (path.includes('\\') || path.split('/').includes('..') || !['-', 'd'].includes(verbose[index][0])) {
      throw new Error('unsafe Office source archive entry: ' + entry)
    }
    if (path.startsWith('product/vendor/dsh-univer-office/node_modules/')) {
      throw new Error('portable Office payload must not include platform node_modules')
    }
  })
  const temporary = mkdtempSync(join(tmpdir(), 'agent-pi-office-archive-'))
  try {
    tar(['-xf', archive, '-C', temporary, ...selected])
    assertUniverPublicReleaseTree(join(temporary, 'product'), { runtime: false })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
  return archive
}

function main(args = process.argv.slice(2)) {
  const [command, path, ...flags] = args
  if (!path || !['assert-tree', 'assert-archive'].includes(command)
      || flags.some(flag => flag !== '--portable') || (command === 'assert-archive' && flags.length)) {
    throw new Error('Usage: univer-public-release.mjs assert-tree <product> [--portable] | assert-archive <payload>')
  }
  if (command === 'assert-tree') assertUniverPublicReleaseTree(path, { runtime: !flags.includes('--portable') })
  else assertUniverPublicReleaseArchive(path)
  process.stdout.write('official Office distribution verified: ' + resolve(path) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
