#!/usr/bin/env node

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
export const defaultUniverRuntimeLockPath = join(scriptDir, 'dsh-univer-office-runtime.package-lock.json')

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

export function validateUniverRuntimeLock(pluginManifest, lock) {
  if (lock?.lockfileVersion !== 3 || lock?.name !== 'agent-pi-univer-runtime') {
    throw new Error('unsupported dsh-univer-office production lock')
  }
  const expected = dependencyEntries(productionRuntimeManifest(pluginManifest).dependencies)
  const actual = dependencyEntries(lock.packages?.['']?.dependencies)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('dsh-univer-office production lock does not match the pinned plugin manifest')
  }
  for (const [name] of expected) {
    const entry = lock.packages?.[`node_modules/${name}`]
    if (!entry?.version || !entry?.resolved || !/^sha512-/.test(entry?.integrity ?? '')) {
      throw new Error(`dsh-univer-office production lock is incomplete for ${name}`)
    }
  }
  return lock
}

export function runtimeDependenciesReady(pluginDir, dependencies, lock = null) {
  return Object.keys(dependencies ?? {}).every((name) => {
    const manifestPath = join(pluginDir, 'node_modules', ...name.split('/'), 'package.json')
    if (!existsSync(manifestPath)) return false
    const expectedVersion = lock?.packages?.[`node_modules/${name}`]?.version
    if (!expectedVersion) return true
    try {
      return JSON.parse(readFileSync(manifestPath, 'utf8')).version === expectedVersion
    } catch {
      return false
    }
  })
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
) {
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
  const production = productionRuntimeManifest(manifest)
  const lock = validateUniverRuntimeLock(manifest, JSON.parse(readFileSync(resolve(lockPath), 'utf8')))
  if (runtimeDependenciesReady(pluginDir, production.dependencies, lock)) return { installed: false }

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
    if (!runtimeDependenciesReady(pluginDir, production.dependencies, lock)) {
      throw new Error('dsh-univer-office production dependencies do not match the tracked lock after npm ci')
    }
  } finally {
    rmSync(installDir, { recursive: true, force: true })
  }
  return { installed: true }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const pluginDir = process.argv[2] ? resolve(process.argv[2]) : ''
  if (!pluginDir) throw new Error('Usage: install-univer-runtime-deps.mjs <plugin-dir>')
  const result = installUniverRuntimeDeps(pluginDir)
  process.stdout.write(`Univer runtime dependencies ${result.installed ? 'installed' : 'ready'} at ${pluginDir}\n`)
}
