#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expectedDshCommit, expectedDshVersion } from './verify-dsh-runtime.mjs'

export const dshBuildReceiptName = 'DSH-BUILD-RECEIPT.json'
export const dshBuildReceiptSchema = 1
export const dshBuildCommands = ['pnpm run build:lib', 'pnpm run build:web']
export const dshRuntimeFilePolicy = Object.freeze(JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'dsh-runtime-file-policy.json'),
  'utf8',
)))

const excludedDirectoryNames = new Set(dshRuntimeFilePolicy.excludedDirectoryNames)
const excludedFileNames = new Set(dshRuntimeFilePolicy.excludedFileNames)
const excludedFileSuffixes = dshRuntimeFilePolicy.excludedFileSuffixes

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: options.stdio ?? 'pipe',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})${detail ? `: ${detail}` : ''}`)
  }
  return (result.stdout || '').trim()
}

function git(dsh, args) {
  return run('git', ['-C', dsh, ...args])
}

function normalizePath(root, file) {
  return relative(root, file).split(sep).join('/')
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function describeFile(root, path) {
  const absolute = join(root, path)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`DSH build input missing regular file: ${path}`)
  }
  return { path, bytes: statSync(absolute).size, sha256: sha256(absolute) }
}

function isArtifact(relativePath) {
  if (relativePath.endsWith('.map') || relativePath.endsWith('.tsbuildinfo')) return false
  if (relativePath.startsWith('apps/web/dist/')) return true
  const parts = relativePath.split('/')
  return parts.includes('lib') && ['apps', 'packages', 'vendor', 'native'].includes(parts[0])
}

function isExcludedFile(relativePath) {
  const normalized = relativePath.split(sep).join('/')
  const parts = normalized.split('/')
  const name = parts.at(-1)
  return parts.slice(0, -1).some((part) => excludedDirectoryNames.has(part))
    || excludedFileNames.has(name)
    || excludedFileSuffixes.some((suffix) => name.endsWith(suffix))
}

function walkFiles(root, directory = root, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    const rel = normalizePath(root, absolute)
    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) continue
    if (entry.isSymbolicLink()) {
      if (excludedDirectoryNames.has(entry.name) || isExcludedFile(rel)) continue
      throw new Error(`DSH packaged runtime must not be a symlink: ${rel}`)
    }
    if (entry.isDirectory()) walkFiles(root, absolute, output)
    else if (entry.isFile()) {
      if (!isExcludedFile(rel)) output.push(rel)
    }
  }
  return output
}

function runtimeInventory(dsh) {
  const paths = walkFiles(dsh).sort()
  for (const marker of ['apps/cli/lib/bin.js', 'apps/web/dist/index.html']) {
    if (!paths.includes(marker)) throw new Error(`official DSH build did not produce ${marker}`)
  }
  return {
    sourceFiles: paths.filter((path) => !isArtifact(path)).map((path) => describeFile(dsh, path)),
    artifacts: paths.filter((path) => isArtifact(path)).map((path) => describeFile(dsh, path)),
  }
}

function trackedSourceInventory(dsh) {
  const paths = git(dsh, ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !isExcludedFile(path) && !isArtifact(path))
    .sort()
  return paths.map((path) => describeFile(dsh, path))
}

export function assertExactCleanDsh(dshRoot, productRoot) {
  const dsh = realpathSync(resolve(dshRoot))
  const product = resolve(productRoot)
  const top = resolve(git(dsh, ['rev-parse', '--show-toplevel']))
  if (top.toLowerCase() !== dsh.toLowerCase()) {
    throw new Error(`DSH path is not its Git worktree root: ${dsh}`)
  }
  const commit = git(dsh, ['rev-parse', 'HEAD'])
  if (commit !== expectedDshCommit) {
    throw new Error(`DSH source commit is ${commit}; expected ${expectedDshCommit}`)
  }
  const dirty = git(dsh, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (dirty) throw new Error(`DSH source checkout is not clean:\n${dirty}`)
  const version = JSON.parse(readFileSync(join(dsh, 'package.json'), 'utf8')).version
  if (version !== expectedDshVersion) {
    throw new Error(`DSH source version is ${version}; expected ${expectedDshVersion}`)
  }
  const pin = readFileSync(join(product, 'DSH_PIN'), 'utf8').trim()
  if (pin !== expectedDshCommit) {
    throw new Error(`DSH_PIN is ${pin}; expected ${expectedDshCommit}`)
  }
  return { dsh, product, commit, version, pin }
}

function removeOldArtifacts(dsh) {
  const candidates = []
  function walk(directory, depth = 0) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const absolute = join(directory, entry.name)
      const rel = normalizePath(dsh, absolute)
      if (rel === 'apps/web/dist' || (
        entry.name === 'lib' && ['apps', 'packages', 'vendor', 'native'].includes(rel.split('/')[0])
      )) {
        candidates.push(absolute)
        continue
      }
      if (depth < 8) walk(absolute, depth + 1)
    }
  }
  walk(dsh)
  for (const directory of candidates) rmSync(directory, { recursive: true, force: true })
}

export function writeDshBuildReceipt({ dshRoot, productRoot, receiptPath }) {
  const identity = assertExactCleanDsh(dshRoot, productRoot)
  const inventory = runtimeInventory(identity.dsh)
  assertEntries(inventory.sourceFiles, trackedSourceInventory(identity.dsh), 'DSH source checkout')
  const receipt = {
    schemaVersion: dshBuildReceiptSchema,
    kind: 'agent-pi-dsh-official-build',
    dshCommit: identity.commit,
    dshVersion: identity.version,
    dshPin: identity.pin,
    buildCommands: dshBuildCommands,
    sourceFiles: inventory.sourceFiles,
    artifacts: inventory.artifacts,
  }
  const destination = resolve(receiptPath)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

export function buildDshWithReceipt({ dshRoot, productRoot, receiptPath }) {
  const identity = assertExactCleanDsh(dshRoot, productRoot)
  removeOldArtifacts(identity.dsh)
  const corepackPnpm = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js')
  const pnpm = process.platform === 'win32' ? process.execPath : 'pnpm'
  const prefix = process.platform === 'win32' ? [corepackPnpm] : []
  if (process.platform === 'win32' && !existsSync(corepackPnpm)) {
    throw new Error(`Corepack pnpm launcher missing: ${corepackPnpm}`)
  }
  for (const script of ['build:lib', 'build:web']) {
    run(pnpm, [...prefix, 'run', script], { cwd: identity.dsh, stdio: 'inherit' })
  }
  const receipt = writeDshBuildReceipt({ dshRoot: identity.dsh, productRoot, receiptPath })
  verifyDshBuildReceipt({ dshRoot: identity.dsh, productRoot, receiptPath, requireGit: true })
  return receipt
}

function assertEntries(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new Error(`${label} inventory length mismatch`)
  }
  for (let index = 0; index < expected.length; index += 1) {
    const left = actual[index]
    const right = expected[index]
    if (left?.path !== right.path || left?.bytes !== right.bytes || left?.sha256 !== right.sha256) {
      throw new Error(`${label} hash mismatch for ${right.path}`)
    }
  }
}

export function verifyDshBuildReceipt({ dshRoot, productRoot, receiptPath, requireGit = false }) {
  const dsh = resolve(dshRoot)
  const product = resolve(productRoot)
  const destination = resolve(receiptPath)
  if (!existsSync(destination)) throw new Error(`DSH build receipt missing: ${destination}`)
  const receipt = JSON.parse(readFileSync(destination, 'utf8'))
  const pin = readFileSync(join(product, 'DSH_PIN'), 'utf8').trim()
  const version = JSON.parse(readFileSync(join(dsh, 'package.json'), 'utf8')).version
  if (receipt.schemaVersion !== dshBuildReceiptSchema || receipt.kind !== 'agent-pi-dsh-official-build') {
    throw new Error('unsupported DSH build receipt')
  }
  if (receipt.dshCommit !== expectedDshCommit || receipt.dshPin !== pin || pin !== expectedDshCommit) {
    throw new Error(`DSH build receipt commit/pin mismatch; expected ${expectedDshCommit}`)
  }
  if (receipt.dshVersion !== expectedDshVersion || version !== expectedDshVersion) {
    throw new Error(`DSH build receipt version mismatch; expected ${expectedDshVersion}`)
  }
  if (JSON.stringify(receipt.buildCommands) !== JSON.stringify(dshBuildCommands)) {
    throw new Error('DSH build receipt command list mismatch')
  }
  const inventory = runtimeInventory(dsh)
  if (requireGit) {
    const identity = assertExactCleanDsh(dsh, product)
    assertEntries(inventory.sourceFiles, trackedSourceInventory(identity.dsh), 'DSH source checkout')
  }
  assertEntries(receipt.sourceFiles, inventory.sourceFiles, 'DSH source')
  assertEntries(receipt.artifacts, inventory.artifacts, 'DSH artifact')
  return receipt
}

function value(args, name) {
  const index = args.indexOf(`--${name}`)
  if (index === -1 || index + 1 >= args.length) throw new Error(`missing --${name}`)
  return args[index + 1]
}

export function main(args = process.argv.slice(2)) {
  const command = args[0]
  if (!['build', 'verify'].includes(command)) {
    throw new Error('Usage: dsh-build-receipt.mjs <build|verify> --dsh <dir> --product <dir> --receipt <file> [--source]')
  }
  const options = {
    dshRoot: value(args, 'dsh'),
    productRoot: value(args, 'product'),
    receiptPath: value(args, 'receipt'),
  }
  if (command === 'build') buildDshWithReceipt(options)
  else verifyDshBuildReceipt({ ...options, requireGit: args.includes('--source') })
  process.stdout.write(`DSH ${expectedDshVersion} ${command} receipt verified\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
