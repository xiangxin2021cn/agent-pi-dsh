import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const expectedDshCommit = 'd347e703908d0406b7a7ef80e3a0e594d86b2215'
export const expectedDshVersion = '0.1.3-alpha.1'

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

export function main(args = process.argv.slice(2)) {
  const checkNative = args.at(-1) === '--native'
  const paths = checkNative ? args.slice(0, -1) : args
  if (paths.length < 1 || paths.length > 2) {
    throw new Error('Usage: verify-dsh-runtime.mjs <dsh-root> [product-root] [--native]')
  }
  const verified = verifyDshRuntime(paths[0], paths[1])
  if (checkNative) {
    const require = createRequire(join(verified.dsh, 'packages', 'session', 'session-persistence-jsonl', 'package.json'))
    require('fs-ext')
    require('koffi')
    if (verified.product) verifyCodexRuntime(verified.product)
  }
  process.stdout.write(`DSH ${expectedDshVersion} runtime verified: ${verified.dsh}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
