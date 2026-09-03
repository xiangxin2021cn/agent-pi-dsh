#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const windowsBuildReceiptSchema = 1
export const windowsBuildReceiptKind = 'agent-pi-dsh-windows-build'

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim()
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function fileEntry(path) {
  const absolute = resolve(path)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Windows build input missing regular file: ${absolute}`)
  }
  return {
    name: basename(absolute),
    bytes: statSync(absolute).size,
    sha256: sha256(absolute),
  }
}

function releaseIdentity(root) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const appVersion = packageJson.version
  if (!/^\d+\.\d+\.\d+$/.test(appVersion || '')) {
    throw new Error(`invalid Agent Pi release version: ${appVersion}`)
  }
  if (packageJson.license !== 'GPL-3.0-only') {
    throw new Error('Windows 3.6.0 release must declare GPL-3.0-only')
  }
  const releaseTag = `v${appVersion}`
  const sourceCommit = git(root, ['rev-parse', 'HEAD'])
  let exactTag = ''
  try {
    exactTag = git(root, ['describe', '--exact-match', '--tags', 'HEAD'])
  } catch {
    // Report one stable release-gate error instead of exposing git's varying
    // no-tag diagnostics on different platforms.
  }
  if (exactTag !== releaseTag) {
    throw new Error(`Windows build requires the exact ${releaseTag} tag`)
  }
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (status) throw new Error('Windows build requires a completely clean checkout')
  return {
    appVersion,
    releaseTag,
    sourceCommit,
    dshPin: readFileSync(join(root, 'DSH_PIN'), 'utf8').trim(),
  }
}

function currentReceipt(options) {
  const root = resolve(options.root)
  const identity = releaseIdentity(root)
  const cadManifestPath = join(resolve(options.cadRuntimeDir), 'CAD-CLEAN-BUILD.json')
  return {
    schemaVersion: windowsBuildReceiptSchema,
    kind: windowsBuildReceiptKind,
    ...identity,
    installer: fileEntry(options.installerPath),
    installerPayload: fileEntry(options.payloadPath),
    cadRuntimeManifest: fileEntry(cadManifestPath),
    cadSource: fileEntry(options.cadSourcePath),
    dshBuildReceipt: fileEntry(options.dshReceiptPath),
  }
}

export function createWindowsBuildReceipt(options) {
  const receipt = currentReceipt(options)
  writeFileSync(resolve(options.receiptPath), `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

export function verifyWindowsBuildReceipt(options) {
  const receiptPath = resolve(options.receiptPath)
  if (!existsSync(receiptPath)) throw new Error(`Windows build receipt missing: ${receiptPath}`)
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  if (receipt.schemaVersion !== windowsBuildReceiptSchema || receipt.kind !== windowsBuildReceiptKind) {
    throw new Error('unsupported Windows build receipt')
  }
  const expected = currentReceipt(options)
  for (const key of ['appVersion', 'releaseTag', 'sourceCommit', 'dshPin']) {
    if (receipt[key] !== expected[key]) throw new Error(`Windows build receipt ${key} mismatch`)
  }
  for (const key of ['installer', 'installerPayload', 'cadRuntimeManifest', 'cadSource', 'dshBuildReceipt']) {
    const actualEntry = receipt[key]
    const expectedEntry = expected[key]
    if (actualEntry?.name !== expectedEntry.name) throw new Error(`Windows build receipt name mismatch for ${key}`)
    if (actualEntry?.bytes !== expectedEntry.bytes) throw new Error(`Windows build receipt size mismatch for ${key}`)
    if (actualEntry?.sha256 !== expectedEntry.sha256) throw new Error(`Windows build receipt hash mismatch for ${key}`)
  }
  return receipt
}

function value(args, name) {
  const index = args.indexOf(`--${name}`)
  if (index === -1 || index + 1 >= args.length) throw new Error(`missing --${name}`)
  return args[index + 1]
}

export function main(args = process.argv.slice(2)) {
  const command = args[0]
  if (!['create', 'verify'].includes(command)) {
    throw new Error('Usage: windows-build-receipt.mjs <create|verify> --root <dir> --installer <file> --payload <file> --cad-runtime <dir> --cad-source <file> --dsh-receipt <file> --receipt <file>')
  }
  const options = {
    root: value(args, 'root'),
    installerPath: value(args, 'installer'),
    payloadPath: value(args, 'payload'),
    cadRuntimeDir: value(args, 'cad-runtime'),
    cadSourcePath: value(args, 'cad-source'),
    dshReceiptPath: value(args, 'dsh-receipt'),
    receiptPath: value(args, 'receipt'),
  }
  const receipt = command === 'create'
    ? createWindowsBuildReceipt(options)
    : verifyWindowsBuildReceipt(options)
  process.stdout.write(`Windows ${receipt.appVersion} build receipt ${command}d\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
