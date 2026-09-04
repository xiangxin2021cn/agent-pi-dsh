import { lstatSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const forbiddenPathParts = [
  'vendor/dsh-univer-office',
  'node_modules/@univerjs-pro',
  'agent-pi-univer-runtime-receipt.json',
]

export const excludedUniverReleaseFiles = [
  'vendor/dsh-univer-office',
  'vendor/dsh-univer-office.pin',
  'scripts/dsh-univer-office-runtime.package-lock.json',
  'scripts/install-univer-runtime-deps.mjs',
  'scripts/materialize-dsh-univer-office.mjs',
  'scripts/materialize-dsh-univer-office.test.mjs',
  'scripts/patch-univer-alpha1.mjs',
  'scripts/patch-univer-alpha1.test.mjs',
  'scripts/univer-runtime-install.test.mjs',
]

function normalized(path) {
  return String(path).split(sep).join('/').replaceAll('\\', '/')
}

function forbiddenEntry(path) {
  const lower = normalized(path).toLowerCase()
  return forbiddenPathParts.some((part) => lower.includes(part))
}

export function removeBundledUniverFromProduct(productRoot) {
  const root = resolve(productRoot)
  const removed = []
  for (const item of excludedUniverReleaseFiles) {
    const path = join(root, ...item.split('/'))
    let stat
    try {
      stat = lstatSync(path)
    } catch {
      continue
    }
    rmSync(path, { recursive: !stat.isSymbolicLink(), force: true })
    removed.push(item)
  }
  return removed
}

export function assertUniverPublicReleaseTree(rootPath) {
  const root = resolve(rootPath)
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const rel = normalized(relative(root, path))
      if (forbiddenEntry(`/${rel}`)) {
        throw new Error(`public release contains bundled Univer Pro integration: ${rel}`)
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path)
    }
  }
  return root
}

export function assertUniverPublicReleaseArchive(archivePath) {
  const archive = resolve(archivePath)
  const listed = spawnSync('tar', ['-tf', archive], { encoding: 'utf8', windowsHide: true })
  if (listed.status !== 0) {
    throw new Error(`cannot inspect public release archive ${archive}: ${listed.stderr || listed.status}`)
  }
  for (const entry of listed.stdout.split(/\r?\n/).filter(Boolean)) {
    if (forbiddenEntry(`/${entry}`)) {
      throw new Error(`public release archive contains bundled Univer Pro integration: ${entry}`)
    }
  }
  return archive
}

function main(args = process.argv.slice(2)) {
  const [command, path] = args
  if (!path || !['sanitize', 'assert-tree', 'assert-archive'].includes(command)) {
    throw new Error('Usage: univer-public-release.mjs sanitize|assert-tree|assert-archive <path>')
  }
  if (command === 'sanitize') {
    const removed = removeBundledUniverFromProduct(path)
    assertUniverPublicReleaseTree(path)
    process.stdout.write(`public Univer boundary ready; removed ${removed.length} bundled item(s)\n`)
    return
  }
  if (command === 'assert-tree') assertUniverPublicReleaseTree(path)
  else assertUniverPublicReleaseArchive(path)
  process.stdout.write(`public Univer boundary verified: ${resolve(path)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
