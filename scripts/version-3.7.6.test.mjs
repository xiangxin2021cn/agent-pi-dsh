import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const json = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'))
const pin = '21638c56315ae6a2b552d6091945d3144c9af32e'

test('3.7.6 identity matches product manifests and the exact official main commit', () => {
  for (const file of ['package.json', 'apps/desktop/package.json', 'apps/desktop/package-lock.json', 'bundles/task-guide/package.json', 'bundles/agent-pi-compaction/package.json']) {
    assert.equal(json(file).version, '3.7.6', file)
  }
  assert.equal(json('apps/desktop/package-lock.json').packages[''].version, '3.7.6')
  assert.equal(readFileSync(join(root, 'DSH_PIN'), 'utf8').trim(), pin)
  assert.equal(json('release/kernel-version-history.json').at(-1).dshPin, pin)
  const notes = readFileSync(join(root, 'release/github-notes-3.7.6.md'), 'utf8')
  const meta = JSON.parse(notes.match(/agent-pi-release-meta: (.*?) -->/)[1])
  assert.equal(meta.appVersion, '3.7.6')
  assert.equal(meta.kernel.commit, pin)
  assert.equal(meta.kernel.sourceRef, 'main')
  assert.match(notes, /不是新的官方 Release/)
  assert.match(readFileSync(join(root, 'apps/desktop/codex-models.mjs'), 'utf8'), /clientInfo: \{ name: 'agent-pi-dsh', version: '3\.7\.6' \}/)
  assert.match(readFileSync(join(root, 'vendor/README.md'), 'utf8'), /Agent Pi DSH 3\.7\.6/)
})
