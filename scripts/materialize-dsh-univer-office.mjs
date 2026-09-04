#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { patchUniverForDshAlpha1 } from './patch-univer-alpha1.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDir, '..')
const defaultPinPath = join(repositoryRoot, 'vendor', 'dsh-univer-office.pin')
const receiptName = 'AGENT-PI-VENDOR-RECEIPT.json'

function fail(message) {
  throw new Error(message)
}

function sha(bytes, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(bytes).digest(encoding)
}

function assertHex(value, length, label) {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    fail(`${label} must be ${length} lowercase hexadecimal characters`)
  }
}

export function loadUniverPin(pinPath = defaultPinPath) {
  const pin = JSON.parse(readFileSync(resolve(pinPath), 'utf8'))
  if (pin.schema !== 'agent-pi-dsh/univer-office-pin/v1') fail('unsupported dsh-univer-office pin schema')
  if (pin.name !== 'dsh-univer-office' || pin.version !== '0.2.9') fail('unexpected dsh-univer-office identity')
  if (pin.license !== 'Apache-2.0') fail('dsh-univer-office pin must declare Apache-2.0')
  if (pin.tarball !== `https://registry.npmjs.org/${pin.name}/-/${pin.name}-${pin.version}.tgz`) {
    fail('dsh-univer-office tarball URL does not match the pinned package')
  }
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pin.integrity)) fail('invalid dsh-univer-office SHA512 SRI')
  assertHex(pin.shasum, 40, 'dsh-univer-office npm shasum')
  assertHex(pin.source?.tagObject, 40, 'dsh-univer-office tag object')
  assertHex(pin.source?.commit, 40, 'dsh-univer-office source commit')
  if (pin.source?.repository !== 'https://github.com/dream-num/dsh-univer-office') {
    fail('unexpected dsh-univer-office source repository')
  }
  if (pin.source?.tag !== `v${pin.version}`) fail('dsh-univer-office source tag does not match the package version')
  if (!Number.isSafeInteger(pin.archiveBytes) || pin.archiveBytes <= 0) fail('invalid dsh-univer-office archive size')
  if (!Number.isSafeInteger(pin.archiveEntries) || pin.archiveEntries <= 0) fail('invalid dsh-univer-office entry count')
  return pin
}

export function verifyUniverTarball(bytes, pin) {
  if (bytes.length !== pin.archiveBytes) {
    fail(`dsh-univer-office tarball size is ${bytes.length}; expected ${pin.archiveBytes}`)
  }
  const expectedSha512 = pin.integrity.slice('sha512-'.length)
  if (sha(bytes, 'sha512', 'base64') !== expectedSha512) fail('dsh-univer-office tarball SHA512 integrity mismatch')
  if (sha(bytes, 'sha1') !== pin.shasum) fail('dsh-univer-office tarball npm shasum mismatch')
}

function runTar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) {
    fail(`tar ${args[0]} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result.stdout
}

export function assertSafeUniverArchive(archivePath, pin) {
  const archive = resolve(archivePath)
  const entries = runTar(['-tzf', archive]).split(/\r?\n/).filter(Boolean)
  const verboseEntries = runTar(['-tvzf', archive]).split(/\r?\n/).filter(Boolean)
  if (entries.length !== verboseEntries.length) fail('dsh-univer-office tar listings disagree')
  if (entries.length !== pin.archiveEntries) {
    fail(`dsh-univer-office tarball has ${entries.length} entries; expected ${pin.archiveEntries}`)
  }

  for (const entry of verboseEntries) {
    const type = entry[0]
    if (type !== '-' && type !== 'd') {
      const label = ({
        l: 'symbolic link',
        h: 'hard link',
        b: 'block device',
        c: 'character device',
        p: 'fifo',
        s: 'socket',
      })[type] || `type ${JSON.stringify(type)}`
      fail(`unsafe dsh-univer-office archive entry type: ${label}`)
    }
  }

  for (const raw of entries) {
    const name = raw.replace(/^\.\//, '').replace(/\/$/, '')
    if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\') || name.split('/').includes('..')) {
      fail(`unsafe dsh-univer-office archive entry: ${raw}`)
    }
    if (name !== 'package' && !name.startsWith('package/')) {
      fail(`dsh-univer-office archive entry is outside package/: ${raw}`)
    }
  }
}

function walkTree(root) {
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) fail(`materialized dsh-univer-office contains a symbolic link: ${path}`)
      if (stat.isDirectory()) pending.push(path)
      else if (!stat.isFile()) fail(`materialized dsh-univer-office contains an unsupported entry: ${path}`)
    }
  }
}

function receiptFileList(pluginRoot) {
  const root = resolve(pluginRoot)
  const files = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory).sort().reverse()) {
      const path = join(directory, entry)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) fail(`materialized dsh-univer-office contains a symbolic link: ${path}`)
      if (stat.isDirectory()) {
        pending.push(path)
      } else if (stat.isFile()) {
        const relativePath = relative(root, path).split(sep).join('/')
        if (relativePath !== receiptName) {
          files.push({
            path: relativePath,
            size: stat.size,
            sha256: sha(readFileSync(path), 'sha256'),
          })
        }
      } else {
        fail(`materialized dsh-univer-office contains an unsupported entry: ${path}`)
      }
    }
  }
  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}

function validatePackage(pluginRoot, pin) {
  const root = resolve(pluginRoot)
  walkTree(root)
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (manifest.name !== pin.name || manifest.version !== pin.version || manifest.license !== pin.license) {
    fail('materialized dsh-univer-office package identity does not match its pin')
  }
  for (const relativePath of ['LICENSE', 'lib/index.js', 'lib/client.js']) {
    if (!existsSync(join(root, relativePath))) fail(`materialized dsh-univer-office is missing ${relativePath}`)
  }
  const license = readFileSync(join(root, 'LICENSE'), 'utf8')
  if (!license.includes('Apache License') || !license.includes('Version 2.0, January 2004')) {
    fail('materialized dsh-univer-office does not carry the Apache License 2.0 text')
  }
  if (existsSync(join(root, 'node_modules')) || existsSync(join(root, '.git'))) {
    fail('materialized dsh-univer-office source package must not contain node_modules or .git')
  }
  return manifest
}

function validateCompatibilityPatch(pluginRoot) {
  const clientPath = join(pluginRoot, 'lib', 'client.js')
  const source = readFileSync(clientPath, 'utf8')
  for (const marker of [
    'ctx.uiConversation.events.register(univerTurnDefinition)',
    'snapshot.views.get("chat")',
  ]) {
    if (!source.includes(marker)) fail(`dsh-univer-office compatibility patch is missing ${marker}`)
  }
  for (const marker of ['conversationEvents', 'session.chat.timeline', 'props.useSession(']) {
    if (source.includes(marker)) fail(`dsh-univer-office compatibility patch left obsolete marker ${marker}`)
  }
  return source
}

function writeReceipt(pluginRoot, pin, clientSource) {
  const patchPath = join(scriptDir, 'patch-univer-alpha1.mjs')
  const receipt = {
    schema: 'agent-pi-dsh/univer-office-vendor-receipt/v1',
    package: { name: pin.name, version: pin.version, license: pin.license },
    tarball: {
      url: pin.tarball,
      integrity: pin.integrity,
      shasum: pin.shasum,
      bytes: pin.archiveBytes,
      entries: pin.archiveEntries,
    },
    source: pin.source,
    compatibilityPatch: {
      path: 'scripts/patch-univer-alpha1.mjs',
      sha256: sha(readFileSync(patchPath), 'sha256'),
    },
    patchedClient: {
      path: 'lib/client.js',
      sha256: sha(Buffer.from(clientSource), 'sha256'),
    },
    files: receiptFileList(pluginRoot),
  }
  writeFileSync(join(pluginRoot, receiptName), `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

export function verifyMaterializedUniver(pluginRoot, pinPath = defaultPinPath) {
  const pin = loadUniverPin(pinPath)
  const root = resolve(pluginRoot)
  validatePackage(root, pin)
  const client = validateCompatibilityPatch(root)
  const receipt = JSON.parse(readFileSync(join(root, receiptName), 'utf8'))
  if (receipt.schema !== 'agent-pi-dsh/univer-office-vendor-receipt/v1') fail('invalid dsh-univer-office vendor receipt')
  if (JSON.stringify(receipt.package) !== JSON.stringify({ name: pin.name, version: pin.version, license: pin.license })) {
    fail('dsh-univer-office vendor receipt package mismatch')
  }
  if (JSON.stringify(receipt.source) !== JSON.stringify(pin.source)) fail('dsh-univer-office vendor receipt source mismatch')
  if (receipt.tarball?.integrity !== pin.integrity || receipt.tarball?.shasum !== pin.shasum
      || receipt.tarball?.bytes !== pin.archiveBytes || receipt.tarball?.entries !== pin.archiveEntries
      || receipt.tarball?.url !== pin.tarball) {
    fail('dsh-univer-office vendor receipt tarball mismatch')
  }
  const patchSha256 = sha(readFileSync(join(scriptDir, 'patch-univer-alpha1.mjs')), 'sha256')
  if (receipt.compatibilityPatch?.sha256 !== patchSha256) fail('dsh-univer-office compatibility patch receipt mismatch')
  if (receipt.patchedClient?.sha256 !== sha(Buffer.from(client), 'sha256')) {
    fail('dsh-univer-office patched client receipt mismatch')
  }
  if (!Array.isArray(receipt.files) || receipt.files.length === 0) {
    fail('dsh-univer-office vendor receipt file list is missing')
  }
  const actualFiles = receiptFileList(root)
  if (JSON.stringify(receipt.files) !== JSON.stringify(actualFiles)) {
    fail('dsh-univer-office vendor receipt file tree mismatch')
  }
  return receipt
}

async function downloadTarball(pin, fetchImpl) {
  const response = await fetchImpl(pin.tarball)
  if (!response.ok) fail(`dsh-univer-office download failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function materializeDshUniverOffice({
  root = repositoryRoot,
  pinPath = join(root, 'vendor', 'dsh-univer-office.pin'),
  archivePath = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const productRoot = resolve(root)
  const pin = loadUniverPin(pinPath)
  const temporaryParent = join(productRoot, '.codex-temp')
  mkdirSync(temporaryParent, { recursive: true })
  const temporary = mkdtempSync(join(temporaryParent, 'univer-office-'))
  const archive = join(temporary, `${pin.name}-${pin.version}.tgz`)
  const unpacked = join(temporary, 'unpacked')
  try {
    const bytes = archivePath
      ? readFileSync(resolve(archivePath))
      : await downloadTarball(pin, fetchImpl)
    verifyUniverTarball(bytes, pin)
    writeFileSync(archive, bytes)
    assertSafeUniverArchive(archive, pin)
    mkdirSync(unpacked, { recursive: true })
    runTar(['-xzf', archive, '-C', unpacked, '--strip-components=1'])
    validatePackage(unpacked, pin)
    patchUniverForDshAlpha1({ pluginRoot: unpacked })
    const client = validateCompatibilityPatch(unpacked)
    writeReceipt(unpacked, pin, client)

    const destination = join(productRoot, 'vendor', pin.name)
    mkdirSync(dirname(destination), { recursive: true })
    rmSync(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    renameSync(unpacked, destination)
    verifyMaterializedUniver(destination, pinPath)
    return { destination, pin, status: 'materialized' }
  } finally {
    rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

export async function main(args = process.argv.slice(2)) {
  const archiveIndex = args.indexOf('--archive')
  const archivePath = archiveIndex === -1 ? null : args[archiveIndex + 1]
  if (archiveIndex !== -1 && !archivePath) fail('--archive requires a path')
  const result = await materializeDshUniverOffice({ archivePath })
  process.stdout.write(`Materialized ${result.pin.name}@${result.pin.version} at ${result.destination}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`)
    process.exitCode = 1
  })
}
