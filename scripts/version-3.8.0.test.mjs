import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { WORKBENCH_PLUGIN_DEFAULTS, workbenchPluginDefaults } from './workbench-plugin-defaults.mjs'

const root = join(import.meta.dirname, '..')
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
test('3.8.0 manifests and separately removable engineering plugins are included in the desktop profile', () => {
  const paths = ['package.json', 'apps/desktop/package.json', 'apps/desktop/package-lock.json', 'bundles/task-guide/package.json', 'bundles/agent-pi-compaction/package.json']
  for (const folder of ['engineering', 'engineering-rebar', 'china-tender', 'engineering-cad', 'engineering-pdf', 'engineering-road', 'engineering-bim', 'engineering-civil', 'engineering-delivery']) {
    const path = `bundles/${folder}/package.json`
    paths.push(path)
    const name = json(path).name
    assert.ok(WORKBENCH_PLUGIN_DEFAULTS.some(([id, directory]) => id === name && directory === folder))
    assert.equal(workbenchPluginDefaults({}, [name]).some(([id]) => id === name), false, 'uninstalled plugins are not silently re-enabled')
    assert.equal(json(path).dsh.bundle.patch, './cordis.patch.yml')
  }
  for (const path of paths) assert.equal(json(path).version, '3.8.0', path)
  assert.equal(json('apps/desktop/package-lock.json').packages[''].version, '3.8.0')
  assert.equal(json('apps/desktop/package.json').build.win.artifactName, 'Agent-Pi-DSH-${version}-x64.${ext}')
})
