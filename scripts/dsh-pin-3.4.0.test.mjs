import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const expectedCommit = '46a7f68b0922371ce7144b668b90e377d8e799f4'

test('the product pins the official DSH 0.1.7-rc.1 release', () => {
  const pin = readFileSync(join(root, 'DSH_PIN'), 'utf8').trim()
  const dshPackage = JSON.parse(
    readFileSync(join(root, 'vendor', 'deepseek-harness', 'package.json'), 'utf8'),
  )

  assert.equal(pin, expectedCommit)
  assert.equal(dshPackage.version, '0.1.7-rc.1')
})
