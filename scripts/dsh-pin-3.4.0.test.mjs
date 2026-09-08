import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const expectedCommit = '2faa751be99c8fbee0524e478f4c53d93b408131'

test('the product pins the official DSH 0.1.5-alpha.1 release', () => {
  const pin = readFileSync(join(root, 'DSH_PIN'), 'utf8').trim()
  const dshPackage = JSON.parse(
    readFileSync(join(root, 'vendor', 'deepseek-harness', 'package.json'), 'utf8'),
  )

  assert.equal(pin, expectedCommit)
  assert.equal(dshPackage.version, '0.1.5-alpha.1')
})
