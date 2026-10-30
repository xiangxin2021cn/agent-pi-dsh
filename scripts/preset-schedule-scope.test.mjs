import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { shippedPresetPlugins } from './preset-bundle-017.mjs'

const root = join(import.meta.dirname, '..')
const shipped = join(root, 'vendor/deepseek-harness/packages/bundle/web-app')

for (const id of ['standard', 'ptc', 'cordis']) {
  test(`product ${id} does not expose the new host-wide Schedule tools`, () => {
    const source = readFileSync(join(shipped, 'presets', `${id}.patch.yml`), 'utf8')
    const plugins = shippedPresetPlugins(source)
    assert.match(plugins, /^- id: tool-schedule\n  name: '@deepseek-ai\/dsh-tool-schedule'\n  disabled: true$/m)
    assert.match(plugins, /^- id: tool-goal$/m)
    assert.match(plugins, /^- id: tool-skill$/m)
    assert.match(plugins, /!!js process.platform/)
  })
}

test('the host Schedule service and human task page remain in the official composition', () => {
  const source = readFileSync(join(shipped, 'cordis.patch.yml'), 'utf8')
  assert.match(source, /- id: schedule\n\s+name: '@deepseek-ai\/dsh-schedule'/)
  assert.match(source, /- id: ui-schedule\n\s+name: '@deepseek-ai\/dsh-client-ui-schedule'/)
})

test('a preset without Schedule keeps its original composition and unevaluated expressions', () => {
  const source = "- insert:\n    - id: preset-test\n      config:\n        plugins:\n          - id: tool-pwsh\n            name: '@deepseek-ai/dsh-tool-pwsh'\n            disabled: !!js process.platform !== 'win32'\n"
  assert.equal(shippedPresetPlugins(source), "- id: tool-pwsh\n  name: '@deepseek-ai/dsh-tool-pwsh'\n  disabled: !!js process.platform !== 'win32'\n")
})
