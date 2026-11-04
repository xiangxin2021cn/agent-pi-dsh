import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { WORKBENCH_PLUGIN_DEFAULTS, workbenchPluginDefaults } from './workbench-plugin-defaults.mjs'

const root = join(import.meta.dirname, '..')
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
test('desktop release manifests agree and engineering plugins remain separately removable', () => {
  const version = json('package.json').version
  for (const path of ['apps/desktop/package.json', 'apps/desktop/package-lock.json', 'bundles/agent-pi-compaction/package.json']) {
    assert.equal(json(path).version, version, path)
  }
  assert.equal(json('apps/desktop/package-lock.json').packages[''].version, version)
  assert.equal(json('bundles/task-guide/package.json').version, '3.8.3')
  for (const folder of ['engineering', 'engineering-rebar', 'china-tender', 'engineering-cad', 'engineering-pdf', 'engineering-road', 'engineering-bim', 'engineering-civil', 'engineering-delivery']) {
    const path = `bundles/${folder}/package.json`
    assert.equal(json(path).version, '3.8.3', path)
    const name = json(path).name
    assert.ok(WORKBENCH_PLUGIN_DEFAULTS.some(([id, directory]) => id === name && directory === folder))
    assert.equal(workbenchPluginDefaults({}, [name]).some(([id]) => id === name), false, 'uninstalled plugins are not silently re-enabled')
    assert.equal(json(path).dsh.bundle.patch, './cordis.patch.yml')
  }
  assert.equal(json('apps/desktop/package.json').build.win.artifactName, 'Agent-Pi-DSH-${version}-x64.${ext}')
})
