import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const json = file => JSON.parse(readFileSync(join(root, file), 'utf8'))
test('3.7.5 release identity matches source, installer manifests and unchanged kernel', () => {
  for (const file of ['package.json','apps/desktop/package.json','apps/desktop/package-lock.json','bundles/task-guide/package.json','bundles/agent-pi-compaction/package.json']) assert.equal(json(file).version,'3.7.5',file)
  assert.equal(json('apps/desktop/package-lock.json').packages[''].version,'3.7.5')
  const notes = readFileSync(join(root,'release/github-notes-3.7.5.md'),'utf8')
  const meta = JSON.parse(notes.match(/agent-pi-release-meta: (.*?) -->/)[1])
  assert.equal(meta.appVersion,'3.7.5')
  assert.equal(meta.kernel.commit,readFileSync(join(root,'DSH_PIN'),'utf8').trim())
  assert.equal(meta.kernel.releaseTag,'dsh-v0.1.7-rc.2')
  assert.match(notes,/GPL-3\.0-only/)
})
test('guide is a native product bundle while the public published downloads remain valid', () => {
  const pkg = json('bundles/task-guide/package.json')
  assert.equal(pkg.dsh.bundle.patch,'./cordis.patch.yml')
  assert.match(readFileSync(join(root,'scripts/workbench-plugin-defaults.mjs'),'utf8'),/task-guide/)
  assert.match(readFileSync(join(root,'README.md'),'utf8'),/releases\/download\/v3\.7\.4\/Agent-Pi-DSH-3\.7\.4-x64\.exe/)
  assert.equal(json('scripts/cad-clean-pins.json').releaseVersion,'3.6.2')
})
