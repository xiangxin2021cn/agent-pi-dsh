import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const expectedCommit = '639ed015397290b3745d163aafe02ffee4aa3f84'

test('the product pins the official DSH 0.2.0-rc.2 release commit', () => {
  const pin = readFileSync(join(root, 'DSH_PIN'), 'utf8').trim()
  const dshPackage = JSON.parse(
    readFileSync(join(root, 'vendor', 'deepseek-harness', 'package.json'), 'utf8'),
  )

  assert.equal(pin, expectedCommit)
  assert.equal(dshPackage.version, '0.2.0-rc.2')
})
