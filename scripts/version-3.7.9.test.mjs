import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = join(import.meta.dirname, '..')
const json = file => JSON.parse(readFileSync(join(root, file), 'utf8'))
const pin = 'ec48669f48ac81bac353fc646e7cf9c57241242f'

test('3.7.9 identity matches manifests, official alpha kernel and vendored dependencies', () => {
  for (const file of ['package.json', 'apps/desktop/package.json', 'apps/desktop/package-lock.json', 'bundles/task-guide/package.json', 'bundles/agent-pi-compaction/package.json']) {
    assert.equal(json(file).version, '3.7.9', file)
  }
  assert.equal(json('apps/desktop/package-lock.json').packages[''].version, '3.7.9')
  assert.equal(readFileSync(join(root, 'DSH_PIN'), 'utf8').trim(), pin)
  assert.equal(json('release/kernel-version-history.json').at(-1).dshPin, pin)
  const notes = readFileSync(join(root, 'release/github-notes-3.7.9.md'), 'utf8')
  const meta = JSON.parse(notes.match(/agent-pi-release-meta: (.*?) -->/)[1])
  assert.equal(meta.appVersion, '3.7.9')
  assert.equal(meta.kernel.commit, pin)
  assert.equal(meta.kernel.releaseTag, 'dsh-v0.2.1-alpha.1')
  assert.equal(json('vendor/deepseek-harness/package.json').version, '0.2.1-alpha.1')
  for (const [name, version] of Object.entries({ cordis: '4.0.5-alpha.1', cosmokit: '1.8.6-alpha.1', schemastery: '3.18.5-alpha.1' })) {
    assert.equal(json(`vendor/deepseek-harness/vendor/${name}/package.json`).version, version)
  }
  assert.equal(json('vendor/deepseek-harness/packages/llm/llm-pi-ai/package.json').dependencies['@earendil-works/pi-ai'], '^0.87.1')
  assert.match(readFileSync(join(root, 'apps/desktop/codex-models.mjs'), 'utf8'), /clientInfo: \{ name: 'agent-pi-dsh', version: '3\.7\.9' \}/)
  assert.match(readFileSync(join(root, 'vendor/README.md'), 'utf8'), /Agent Pi DSH 3\.7\.9/)
})
