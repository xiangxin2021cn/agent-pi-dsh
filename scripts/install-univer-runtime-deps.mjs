#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export function productionRuntimeManifest(pluginManifest) {
  return {
    name: 'agent-pi-univer-runtime',
    private: true,
    dependencies: pluginManifest?.dependencies ?? {},
  }
}

export function runtimeDependenciesReady(pluginDir, dependencies) {
  return Object.keys(dependencies ?? {}).every((name) => (
    existsSync(join(pluginDir, 'node_modules', ...name.split('/'), 'package.json'))
  ))
}

export function installUniverRuntimeDeps(pluginDir, installDir = join(tmpdir(), 'agent-pi-univer-runtime')) {
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
  const production = productionRuntimeManifest(manifest)
  if (runtimeDependenciesReady(pluginDir, production.dependencies)) return { installed: false }

  rmSync(installDir, { recursive: true, force: true })
  mkdirSync(installDir, { recursive: true })
  try {
    writeFileSync(join(installDir, 'package.json'), `${JSON.stringify(production, null, 2)}\n`)
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const result = spawnSync(npm, ['install', '--omit=dev', '--no-fund', '--no-audit'], {
      cwd: installDir,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.status !== 0) {
      throw new Error(`Univer runtime dependency install failed: ${result.stderr || result.status}`)
    }
    cpSync(join(installDir, 'node_modules'), join(pluginDir, 'node_modules'), { recursive: true, force: true })
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
