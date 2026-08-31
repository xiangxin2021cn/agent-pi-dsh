#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function compareVersions(left, right) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
    if (!match) throw new Error(`release version must be x.y.z: ${value}`)
    return match.slice(1).map(Number)
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

export function assertKernelVersionBump({ basePin, baseVersion, currentPin, currentVersion }) {
  if (basePin !== currentPin && compareVersions(currentVersion, baseVersion) <= 0) {
    throw new Error(`DSH_PIN changed but application version did not increase: ${baseVersion} -> ${currentVersion}`)
  }
}

export function assertKernelVersionHistory(history, currentPin, currentVersion) {
  if (!Array.isArray(history) || history.length === 0) throw new Error('kernel version history is empty')
  const versions = new Set()
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index]
    if (versions.has(entry.version)) throw new Error(`duplicate release version: ${entry.version}`)
    versions.add(entry.version)
    if (entry.releaseTag !== `v${entry.version}`) throw new Error(`release tag mismatch for ${entry.version}`)
    if (index > 0 && compareVersions(entry.version, history[index - 1].version) <= 0) {
      throw new Error(`release versions must increase: ${history[index - 1].version} -> ${entry.version}`)
    }
  }
  const latest = history.at(-1)
  if (latest.version !== currentVersion || latest.dshPin !== currentPin) {
    throw new Error(`latest kernel history entry must match ${currentVersion} / ${currentPin}`)
  }
}

function readJson(...parts) {
  return JSON.parse(readFileSync(join(root, ...parts), 'utf8'))
}

function currentIdentity() {
  const rootPackage = readJson('package.json')
  const desktopPackage = readJson('apps', 'desktop', 'package.json')
  const desktopLock = readJson('apps', 'desktop', 'package-lock.json')
  const compactionPackage = readJson('bundles', 'agent-pi-compaction', 'package.json')
  const versions = [
    rootPackage.version,
    desktopPackage.version,
    desktopLock.version,
    desktopLock.packages[''].version,
    compactionPackage.version,
  ]
  if (new Set(versions).size !== 1) throw new Error(`release manifests disagree: ${versions.join(', ')}`)
  return {
    version: versions[0],
    pin: readFileSync(join(root, 'DSH_PIN'), 'utf8').trim(),
  }
}

function readAt(ref, path) {
  return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' }).trim()
}

export function main(args = process.argv.slice(2)) {
  const current = currentIdentity()
  if (args[0] === '--history') {
    assertKernelVersionHistory(readJson('release', 'kernel-version-history.json'), current.pin, current.version)
    console.log(`kernel release history verified: ${current.version} / ${current.pin}`)
    return
  }
  const baseRef = args[0]
  if (!baseRef) throw new Error('Usage: kernel-version-policy.mjs --history | <base-git-ref>')
  assertKernelVersionBump({
    basePin: readAt(baseRef, 'DSH_PIN'),
    baseVersion: JSON.parse(readAt(baseRef, 'apps/desktop/package.json')).version,
    currentPin: current.pin,
    currentVersion: current.version,
  })
  console.log(`kernel version policy verified against ${baseRef}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
