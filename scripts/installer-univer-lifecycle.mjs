#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  detachCurrentProductUniverDependency,
  UNIVER_OFFICE_NAME,
} from './univer-profile-migration.mjs'
import { assertUniverClientCompatibility } from './patch-univer-alpha1.mjs'
import { syncManagedUniverSkills } from './univer-skill-sync.mjs'

const vendorReceiptName = 'AGENT-PI-VENDOR-RECEIPT.json'
const runtimeReceiptName = 'AGENT-PI-UNIVER-RUNTIME-RECEIPT.json'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is invalid: ${error?.message || error}`, { cause: error })
  }
}

function writeJsonTransaction(path, value) {
  const temp = `${path}.agent-pi-new`
  const previous = `${path}.agent-pi-previous`
  rmSync(temp, { force: true })
  rmSync(previous, { force: true })
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(path, previous)
    renameSync(temp, path)
    rmSync(previous, { force: true })
  } catch (error) {
    rmSync(temp, { force: true })
    if (!existsSync(path) && existsSync(previous)) renameSync(previous, path)
    throw error
  }
}

function installedVendorFiles(pluginRoot) {
  const root = resolve(pluginRoot)
  const files = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory).sort().reverse()) {
      if (directory === root && entry === 'node_modules') continue
      const path = join(directory, entry)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) {
        throw new Error(`installed ${UNIVER_OFFICE_NAME} contains a symbolic link: ${relative(root, path)}`)
      }
      if (stat.isDirectory()) {
        pending.push(path)
      } else if (stat.isFile()) {
        const relativePath = relative(root, path).split(sep).join('/')
        if (relativePath !== vendorReceiptName && relativePath !== runtimeReceiptName) {
          files.push({ path: relativePath, size: stat.size, sha256: sha256(readFileSync(path)) })
        }
      } else {
        throw new Error(`installed ${UNIVER_OFFICE_NAME} contains an unsupported entry: ${relative(root, path)}`)
      }
    }
  }
  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}

/**
 * Verify a bundled wrapper after the installer has extracted it into a fresh
 * directory. This is a technical integrity check only. It does not grant or
 * imply permission to redistribute Univer Pro; public builds remain governed
 * by univer-public-release.mjs and require separate OEM authorization.
 */
function verifyLockedUniverRuntime(pluginRoot, productRoot) {
  const verifier = join(productRoot, 'scripts', 'install-univer-runtime-deps.mjs')
  const lock = join(productRoot, 'scripts', 'dsh-univer-office-runtime.package-lock.json')
  if (!existsSync(verifier) || !existsSync(lock)) {
    throw new Error('required licensed dsh-univer-office runtime verifier or lock is missing')
  }
  const result = spawnSync(process.execPath, [verifier, '--verify-only', pluginRoot], {
    cwd: productRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`required licensed dsh-univer-office runtime verification failed: ${result.error?.message || result.stderr || result.stdout || result.status}`)
  }
}

export function verifyInstalledUniverProduct(
  productRoot,
  { required = false, runtimeVerifier = verifyLockedUniverRuntime } = {},
) {
  const pluginRoot = join(resolve(productRoot), 'vendor', UNIVER_OFFICE_NAME)
  if (!existsSync(pluginRoot)) {
    if (required) throw new Error('required licensed dsh-univer-office is not bundled')
    return { present: false }
  }

  const manifest = readJson(join(pluginRoot, 'package.json'), 'dsh-univer-office package manifest')
  if (manifest.name !== UNIVER_OFFICE_NAME || !manifest.version) {
    throw new Error('installed Univer wrapper package identity is invalid')
  }
  if (manifest.dsh?.bundle === undefined) {
    throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} does not declare a DSH bundle`)
  }

  for (const relativePath of ['LICENSE', 'lib/index.js', 'lib/client.js', vendorReceiptName]) {
    if (!existsSync(join(pluginRoot, relativePath))) {
      throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} is missing ${relativePath}`)
    }
  }

  const client = readFileSync(join(pluginRoot, 'lib', 'client.js'), 'utf8')
  assertUniverClientCompatibility({ version: manifest.version, source: client })

  const receipt = readJson(join(pluginRoot, vendorReceiptName), 'dsh-univer-office vendor receipt')
  if (receipt.schema !== 'agent-pi-dsh/univer-office-vendor-receipt/v1'
      || receipt.package?.name !== manifest.name
      || receipt.package?.version !== manifest.version) {
    throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} does not match its vendor receipt`)
  }
  if (receipt.patchedClient?.sha256 !== sha256(Buffer.from(client))) {
    throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} patched client receipt mismatch`)
  }
  if (!Array.isArray(receipt.files) || receipt.files.length === 0) {
    throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} vendor receipt has no file inventory`)
  }
  for (const entry of receipt.files) {
    const segments = typeof entry?.path === 'string' ? entry.path.split('/') : []
    if (segments.length === 0
        || entry.path.includes('\\')
        || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} vendor receipt contains an invalid path`)
    }
    const path = join(pluginRoot, ...segments)
    const stat = existsSync(path) ? lstatSync(path) : null
    if (!stat?.isFile()) {
      throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} is missing receipted file ${entry.path}`)
    }
    const bytes = readFileSync(path)
    if (stat.size !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} receipted file mismatch: ${entry.path}`)
    }
  }
  if (JSON.stringify(receipt.files) !== JSON.stringify(installedVendorFiles(pluginRoot))) {
    throw new Error(`installed ${UNIVER_OFFICE_NAME}@${manifest.version} vendor receipt file tree mismatch`)
  }

  if (required) runtimeVerifier(pluginRoot, resolve(productRoot))
  return {
    present: true,
    version: manifest.version,
    files: receipt.files.length,
    ...(required ? { runtimeVerified: true } : {}),
  }
}

/** Remove an installer-owned profile link while preserving registry installs. */
export function detachInstalledUniverProfile({ profileDir, productRoot }) {
  const manifestPath = join(resolve(profileDir), 'package.json')
  if (!existsSync(manifestPath)) return { changed: false, removedModule: false, removedBundle: false }

  const manifest = readJson(manifestPath, 'tender profile manifest')
  const dependencies = manifest.dependencies && typeof manifest.dependencies === 'object'
    ? { ...manifest.dependencies }
    : {}
  const detached = detachCurrentProductUniverDependency({
    dependencies,
    profileDir: resolve(profileDir),
    productRoot: resolve(productRoot),
  })
  if (!detached.changed) return { ...detached, removedBundle: false }

  const bundles = manifest.dsh?.profile?.bundles
  const nextBundles = Array.isArray(bundles)
    ? bundles.filter((name) => name !== UNIVER_OFFICE_NAME)
    : bundles
  const removedBundle = Array.isArray(bundles) && nextBundles.length !== bundles.length
  const next = {
    ...manifest,
    dependencies,
    ...(manifest.dsh && typeof manifest.dsh === 'object'
      ? {
          dsh: {
            ...manifest.dsh,
            ...(manifest.dsh.profile && typeof manifest.dsh.profile === 'object'
              ? { profile: { ...manifest.dsh.profile, bundles: nextBundles } }
              : {}),
          },
        }
      : {}),
  }
  writeJsonTransaction(manifestPath, next)
  syncManagedUniverSkills({
    home: dirname(dirname(resolve(profileDir))),
    pluginRoot: join(resolve(productRoot), 'vendor', UNIVER_OFFICE_NAME),
    active: false,
  })
  return { ...detached, removedBundle }
}

function main(args = process.argv.slice(2)) {
  const [command, first, second] = args
  if (command === 'verify-product' && first) {
    const result = verifyInstalledUniverProduct(first, { required: args.includes('--required') })
    process.stdout.write(result.present
      ? `verified ${UNIVER_OFFICE_NAME}@${result.version} (${result.files} receipted files)\n`
      : `${UNIVER_OFFICE_NAME} is not bundled in this release\n`)
    return
  }
  if (command === 'detach-profile' && first && second) {
    const result = detachInstalledUniverProfile({ profileDir: first, productRoot: second })
    process.stdout.write(result.changed
      ? `detached installer-owned ${UNIVER_OFFICE_NAME} profile link\n`
      : `no installer-owned ${UNIVER_OFFICE_NAME} profile link found\n`)
    return
  }
  throw new Error('Usage: installer-univer-lifecycle.mjs verify-product <productRoot> [--required] | detach-profile <profileDir> <productRoot>')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
