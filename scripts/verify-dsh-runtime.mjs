import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const expectedDshCommit = '59f2e3be330e37bc2ab91c92da4a081bc3281988'
export const expectedDshVersion = '0.1.5-rc.2'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function verifyDshRuntime(dshRoot, productRoot) {
  const dsh = resolve(dshRoot)
  const product = productRoot ? resolve(productRoot) : null
  const dshPackage = readJson(join(dsh, 'package.json'))

  if (dshPackage.version !== expectedDshVersion) {
    throw new Error(`staged DSH version is ${dshPackage.version}; expected ${expectedDshVersion}`)
  }

  const removedSqlitePackage = join(dsh, 'packages', 'session', 'session-persistence-sqlite')
  if (existsSync(removedSqlitePackage)) {
    throw new Error(`staged DSH contains removed SQLite persistence package: ${removedSqlitePackage}`)
  }

  for (const bundle of ['base', 'sdk-minimal']) {
    const manifestPath = join(dsh, 'packages', 'bundle', bundle, 'package.json')
    const dependencies = readJson(manifestPath).dependencies ?? {}
    if (!dependencies['@deepseek-ai/dsh-session-persistence-jsonl']) {
      throw new Error(`${bundle} does not use JSONL session persistence`)
    }
    if (dependencies['@deepseek-ai/dsh-session-persistence-sqlite']) {
      throw new Error(`${bundle} still references removed SQLite session persistence`)
    }
  }

  if (product) {
    const pin = readFileSync(join(product, 'DSH_PIN'), 'utf8').trim()
    if (pin !== expectedDshCommit) {
      throw new Error(`staged DSH_PIN is ${pin}; expected ${expectedDshCommit}`)
    }
  }

  return { dsh, product }
}

export function verifyCodexRuntime(productRoot) {
  const host = join(resolve(productRoot), 'bundles', 'tender-host', 'package.json')
  const version = readJson(host).dependencies?.['@openai/codex']
  const require = createRequire(host)
  const installed = readJson(require.resolve('@openai/codex/package.json'))
  if (!/^\d+\.\d+\.\d+$/.test(version || '') || installed.version !== version) {
    throw new Error('product Codex CLI does not match its exact dependency pin')
  }
  const wrapper = require.resolve('@openai/codex/bin/codex.js')
  const result = spawnSync(process.execPath, [wrapper, '--version'], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000,
  })
  if (result.error || result.status !== 0 || result.stdout.trim() !== `codex-cli ${version}`) {
    throw new Error('product Codex CLI executable is missing, incompatible, or differs from its package version')
  }
  return { version, wrapper }
}

export async function main(args = process.argv.slice(2)) {
  const checkNative = args.at(-1) === '--native'
  const paths = checkNative ? args.slice(0, -1) : args
  if (paths.length < 1 || paths.length > 2) {
    throw new Error('Usage: verify-dsh-runtime.mjs <dsh-root> [product-root] [--native]')
  }
  const verified = verifyDshRuntime(paths[0], paths[1])
  if (checkNative) {
    const { verifyProductDependencyClosure } = await import('./verify-runtime-dependencies.mjs')
    const closure = verifyProductDependencyClosure(verified.dsh, verified.product)
    process.stdout.write(`Runtime dependency closure verified: ${closure.packages} packages\n`)
    const require = createRequire(join(verified.dsh, 'packages', 'session', 'session-persistence-jsonl', 'package.json'))
    const { tryLockExclusive } = await import(pathToFileURL(require.resolve('@deepseek-ai/node-addon-system/flock')).href)
    if (typeof tryLockExclusive !== 'function') throw new Error('official system flock entry is missing')
    // Import is lazy: exercise the native binary on POSIX instead of only
    // checking its JavaScript entry. Windows persistence uses koffi below.
    if (process.platform !== 'win32') {
      const directory = mkdtempSync(join(tmpdir(), 'agent-pi-flock-check-'))
      const fd = openSync(join(directory, 'lock'), 'wx')
      try { await tryLockExclusive(fd) } finally {
        closeSync(fd)
        rmSync(directory, { recursive: true, force: true })
      }
    }
    require('koffi')
    if (verified.product) verifyCodexRuntime(verified.product)
  }
  process.stdout.write(`DSH ${expectedDshVersion} runtime verified: ${verified.dsh}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
