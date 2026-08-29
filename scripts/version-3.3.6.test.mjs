import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(...parts) {
  return JSON.parse(readFileSync(join(root, ...parts), 'utf8'))
}

test('release manifests resolve to Agent Pi DSH 3.3.6', () => {
  const rootPackage = readJson('package.json')
  const desktopPackage = readJson('apps', 'desktop', 'package.json')
  const desktopLock = readJson('apps', 'desktop', 'package-lock.json')

  assert.equal(rootPackage.version, '3.3.6')
  assert.equal(desktopPackage.version, '3.3.6')
  assert.equal(desktopLock.version, '3.3.6')
  assert.equal(desktopLock.packages[''].version, '3.3.6')
})
