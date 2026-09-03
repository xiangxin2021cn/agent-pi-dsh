import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const expectedDshCommit = 'a66e4702047846cdaa10c66c9d3df3951f5ea70d'
export const expectedDshVersion = '0.1.2-rc.1'

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

export function main(args = process.argv.slice(2)) {
  if (args.length < 1 || args.length > 2) {
    throw new Error('Usage: verify-dsh-runtime.mjs <dsh-root> [product-root]')
  }
  const verified = verifyDshRuntime(args[0], args[1])
  process.stdout.write(`DSH ${expectedDshVersion} runtime verified: ${verified.dsh}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
