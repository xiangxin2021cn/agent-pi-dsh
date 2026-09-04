#!/usr/bin/env node

import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
export const defaultUniverRuntimeLockPath = join(scriptDir, 'dsh-univer-office-runtime.package-lock.json')
export const univerRuntimeReceiptName = 'AGENT-PI-UNIVER-RUNTIME-RECEIPT.json'

export function productionRuntimeManifest(pluginManifest) {
  return {
    name: 'agent-pi-univer-runtime',
    private: true,
    dependencies: pluginManifest?.dependencies ?? {},
  }
}

function dependencyEntries(dependencies) {
  return Object.entries(dependencies ?? {}).sort(([left], [right]) => left.localeCompare(right))
}

function matchesPlatformConstraint(values, current) {
  if (!Array.isArray(values) || values.length === 0) return true
  if (values.includes(`!${current}`)) return false
  const allowed = values.filter((value) => !value.startsWith('!'))
  return allowed.length === 0 || allowed.includes(current)
}

export function currentRuntimeTarget() {
  let libc = null
  if (process.platform === 'linux') {
    libc = process.report?.getReport?.()?.header?.glibcVersionRuntime ? 'glibc' : 'musl'
  }
  return { platform: process.platform, arch: process.arch, libc }
}

function matchesTarget(name, entry, target) {
  let libc = entry.libc
  if (target.platform === 'linux' && !libc) {
    if (name.includes('-musl')) libc = ['musl']
    else if (name.includes('-gnu')) libc = ['glibc']
  }
  return matchesPlatformConstraint(entry.os, target.platform)
    && matchesPlatformConstraint(entry.cpu, target.arch)
    && matchesPlatformConstraint(libc, target.libc)
}

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/'
  const index = lockPath.lastIndexOf(marker)
  if (index === -1) throw new Error(`invalid package-lock package path: ${lockPath}`)
  return lockPath.slice(index + marker.length)
}

function packageRootFromLockPath(pluginDir, lockPath) {
  const packageRoot = resolve(pluginDir, ...lockPath.split('/'))
  const nodeModulesPrefix = `${resolve(pluginDir, 'node_modules')}${sep}`
  if (!packageRoot.startsWith(nodeModulesPrefix)) {
    throw new Error(`locked Univer runtime package escapes node_modules: ${lockPath}`)
  }
  return packageRoot
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function packageFileList(packageRoot) {
  const root = resolve(packageRoot)
  const rootStat = lstatSync(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`locked Univer runtime package root is not a real directory: ${root}`)
  }
  const files = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory).sort().reverse()) {
      const path = join(directory, entry)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) {
        throw new Error(`locked Univer runtime package contains a symbolic link: ${path}`)
      }
      if (stat.isDirectory()) {
        if (entry !== 'node_modules') pending.push(path)
      } else if (stat.isFile()) {
        files.push({
          path: relative(root, path).split(sep).join('/'),
          size: stat.size,
          sha256: sha256(readFileSync(path)),
        })
      } else {
        throw new Error(`locked Univer runtime package contains an unsupported entry: ${path}`)
      }
    }
  }
  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}

function runtimeReceipt(pluginDir, dependencies, lock, lockPath, target) {
  return {
    schemaVersion: 1,
    target: {
      platform: target.platform,
      arch: target.arch,
      libc: target.libc ?? null,
    },
    lockSha256: sha256(readFileSync(resolve(lockPath))),
    packages: runtimePackagesForTarget(dependencies, lock, target).map(({ lockPath: packagePath, name, entry, native }) => ({
      lockPath: packagePath,
      name,
      version: entry.version,
      native,
      files: packageFileList(packageRootFromLockPath(pluginDir, packagePath)),
    })),
  }
}

export function writeUniverRuntimeReceipt(
  pluginDir,
  dependencies,
  lock,
  lockPath = defaultUniverRuntimeLockPath,
  target = currentRuntimeTarget(),
) {
  const receipt = runtimeReceipt(pluginDir, dependencies, lock, lockPath, target)
  writeFileSync(join(pluginDir, univerRuntimeReceiptName), `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

export function verifyUniverRuntimeReceipt(
  pluginDir,
  dependencies,
  lock,
  lockPath = defaultUniverRuntimeLockPath,
  target = currentRuntimeTarget(),
) {
  const receiptPath = join(pluginDir, univerRuntimeReceiptName)
  if (!existsSync(receiptPath)) throw new Error('dsh-univer-office runtime receipt is missing')
  let receipt
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  } catch (error) {
    throw new Error(`dsh-univer-office runtime receipt is invalid: ${error?.message || error}`, { cause: error })
  }
  const actual = runtimeReceipt(pluginDir, dependencies, lock, lockPath, target)
  if (JSON.stringify(receipt) !== JSON.stringify(actual)) {
    throw new Error('dsh-univer-office runtime receipt file tree mismatch')
  }
  return receipt
}

export function runtimePackagesForTarget(dependencies, lock, target = currentRuntimeTarget()) {
  if (!target?.platform || !target?.arch || (target.platform === 'linux' && !target.libc)) {
    throw new Error('target platform, architecture, and Linux libc are required for Univer runtime verification')
  }

  for (const [name] of dependencyEntries(dependencies)) {
    if (!lock?.packages?.[`node_modules/${name}`]?.version) {
      throw new Error(`dsh-univer-office production lock is incomplete for ${name}`)
    }
  }

  const nonOptionalPackages = Object.entries(lock?.packages ?? {})
    .filter(([lockPath, entry]) => lockPath && entry.optional !== true)
    .map(([lockPath, entry]) => ({
      lockPath,
      name: packageNameFromLockPath(lockPath),
      entry,
      native: false,
    }))
    .filter(({ name, entry }) => matchesTarget(name, entry, target))
  const packages = [...nonOptionalPackages]

  const optionalEntries = Object.entries(lock?.packages ?? {})
    .filter(([lockPath, entry]) => lockPath && entry.optional === true)
    .map(([lockPath, entry]) => ({
      lockPath,
      name: packageNameFromLockPath(lockPath),
      entry,
      native: true,
    }))

  for (const { name, entry } of nonOptionalPackages) {
    const optionalNames = new Set(Object.keys(entry.optionalDependencies ?? {}))
    const nativeCandidates = optionalEntries.filter(({ name: optionalName, entry: optionalEntry }) => (
      optionalNames.has(optionalName)
      && Array.isArray(optionalEntry.os)
      && Array.isArray(optionalEntry.cpu)
    ))
    if (nativeCandidates.length === 0) continue
    const matching = nativeCandidates.filter(({ name: optionalName, entry: optionalEntry }) => matchesTarget(optionalName, optionalEntry, target))
    if (matching.length === 0) {
      throw new Error(`dsh-univer-office has no locked native runtime for ${name} on ${target.platform}/${target.arch}${target.libc ? `/${target.libc}` : ''}`)
    }
    packages.push(...matching)
  }

  const unique = new Map(packages.map((item) => [item.lockPath, item]))
  return [...unique.values()].sort((left, right) => left.lockPath < right.lockPath ? -1 : left.lockPath > right.lockPath ? 1 : 0)
}

export function validateUniverRuntimeLock(pluginManifest, lock) {
  if (lock?.lockfileVersion !== 3 || lock?.name !== 'agent-pi-univer-runtime') {
    throw new Error('unsupported dsh-univer-office production lock')
  }
  const expected = dependencyEntries(productionRuntimeManifest(pluginManifest).dependencies)
  const actual = dependencyEntries(lock.packages?.['']?.dependencies)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('dsh-univer-office production lock does not match the pinned plugin manifest')
  }
  for (const [lockPath, entry] of Object.entries(lock.packages ?? {})) {
    if (!lockPath) continue
    const name = packageNameFromLockPath(lockPath)
    if (!entry?.version || !entry?.resolved || !/^sha512-/.test(entry?.integrity ?? '')) {
      throw new Error(`dsh-univer-office production lock is incomplete for ${name}`)
    }
    for (const optionalName of Object.keys(entry.optionalDependencies ?? {})) {
      const present = Object.keys(lock.packages).some((candidatePath) => (
        candidatePath && packageNameFromLockPath(candidatePath) === optionalName
      ))
      if (!present) throw new Error(`dsh-univer-office production lock is incomplete for ${optionalName}`)
    }
  }
  return lock
}

export function runtimeDependenciesReady(pluginDir, dependencies, lock, target = currentRuntimeTarget()) {
  return runtimePackagesForTarget(dependencies, lock, target).every(({ lockPath, name, entry, native }) => {
    const manifestPath = join(packageRootFromLockPath(pluginDir, lockPath), 'package.json')
    if (!existsSync(manifestPath)) return false
    try {
      const packageRoot = dirname(manifestPath)
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (manifest.name !== name || manifest.version !== entry.version) return false
      if (!native) return true
      if (typeof manifest.main !== 'string' || extname(manifest.main) !== '.node') return false
      const main = resolve(packageRoot, manifest.main)
      const packagePrefix = `${resolve(packageRoot)}${sep}`
      return main.startsWith(packagePrefix) && existsSync(main) && lstatSync(main).isFile()
    } catch {
      return false
    }
  })
}

export function loadNativeRuntimePackages(
  pluginDir,
  dependencies,
  lock,
  target = currentRuntimeTarget(),
  loader = createRequire(import.meta.url),
) {
  for (const { lockPath, name, native } of runtimePackagesForTarget(dependencies, lock, target)) {
    if (!native) continue
    const packageRoot = packageRootFromLockPath(pluginDir, lockPath)
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    const main = resolve(packageRoot, manifest.main)
    try {
      loader(main)
    } catch (error) {
      throw new Error(`failed to load locked native Univer runtime ${name}: ${error?.message || error}`, { cause: error })
    }
  }
}

export function resolveNpmInvocation(execPath = process.execPath) {
  const candidates = [
    join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  const npmCli = candidates.find((path) => existsSync(path))
  if (npmCli) return { command: execPath, prefix: [resolve(npmCli)] }
  throw new Error(`npm-cli.js is not adjacent to the current Node executable: ${execPath}`)
}

export function installUniverRuntimeDeps(
  pluginDir,
  installDir = join(tmpdir(), 'agent-pi-univer-runtime'),
  lockPath = defaultUniverRuntimeLockPath,
  target = currentRuntimeTarget(),
) {
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
  const production = productionRuntimeManifest(manifest)
  const lock = validateUniverRuntimeLock(manifest, JSON.parse(readFileSync(resolve(lockPath), 'utf8')))
  if (runtimeDependenciesReady(pluginDir, production.dependencies, lock, target)) {
    try {
      verifyUniverRuntimeReceipt(pluginDir, production.dependencies, lock, lockPath, target)
      loadNativeRuntimePackages(pluginDir, production.dependencies, lock, target)
      return { installed: false }
    } catch {
      // A missing or stale receipt is repaired only by a fresh npm ci below.
    }
  }

  rmSync(installDir, { recursive: true, force: true })
  mkdirSync(installDir, { recursive: true })
  try {
    writeFileSync(join(installDir, 'package.json'), `${JSON.stringify(production, null, 2)}\n`)
    copyFileSync(resolve(lockPath), join(installDir, 'package-lock.json'))
    const npm = resolveNpmInvocation()
    const result = spawnSync(npm.command, [
      ...npm.prefix,
      'ci',
      '--omit=dev',
      '--include=optional',
      '--ignore-scripts',
      '--no-fund',
      '--no-audit',
    ], {
      cwd: installDir,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.error || result.status !== 0) {
      throw new Error(`Univer runtime dependency npm ci failed: ${result.error?.message || result.stderr || result.status}`)
    }
    rmSync(join(pluginDir, 'node_modules'), { recursive: true, force: true })
    cpSync(join(installDir, 'node_modules'), join(pluginDir, 'node_modules'), { recursive: true, force: true })
    if (!runtimeDependenciesReady(pluginDir, production.dependencies, lock, target)) {
      throw new Error('dsh-univer-office production dependencies do not match the tracked lock after npm ci')
    }
    writeUniverRuntimeReceipt(pluginDir, production.dependencies, lock, lockPath, target)
    verifyUniverRuntimeReceipt(pluginDir, production.dependencies, lock, lockPath, target)
    loadNativeRuntimePackages(pluginDir, production.dependencies, lock, target)
  } finally {
    rmSync(installDir, { recursive: true, force: true })
  }
  return { installed: true }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const verifyOnly = args.includes('--verify-only')
  const pluginArg = args.find((argument) => argument !== '--verify-only')
  const pluginDir = pluginArg ? resolve(pluginArg) : ''
  if (!pluginDir) throw new Error('Usage: install-univer-runtime-deps.mjs <plugin-dir>')
  if (verifyOnly) {
    const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
    const production = productionRuntimeManifest(manifest)
    const lock = validateUniverRuntimeLock(manifest, JSON.parse(readFileSync(defaultUniverRuntimeLockPath, 'utf8')))
    if (!runtimeDependenciesReady(pluginDir, production.dependencies, lock)) {
      throw new Error('dsh-univer-office production dependencies do not match the tracked lock')
    }
    verifyUniverRuntimeReceipt(pluginDir, production.dependencies, lock)
    loadNativeRuntimePackages(pluginDir, production.dependencies, lock)
    process.stdout.write(`Univer runtime dependencies verified at ${pluginDir}\n`)
  } else {
    const result = installUniverRuntimeDeps(pluginDir)
    process.stdout.write(`Univer runtime dependencies ${result.installed ? 'installed' : 'ready'} at ${pluginDir}\n`)
  }
}
