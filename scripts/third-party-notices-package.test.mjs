import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = join(import.meta.dirname, '..')

test('PageIndex MIT notice ships in Windows and cross-platform runtime manifests', () => {
  for (const relativePath of [
    'scripts/prepare-win-runtime.ps1',
    'scripts/pack-win.ps1',
    'scripts/pack-runtime-payload.mjs',
  ]) {
    const source = readFileSync(join(root, relativePath), 'utf8')
    assert.match(source, /THIRD_PARTY_NOTICES\.md/, relativePath)
  }
})
