import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { restrictHostScheduleTools, shippedPresetPlugins, writePresetBundle } from './preset-bundle-017.mjs'

const root = join(import.meta.dirname, '..')
const shipped = join(root, 'vendor/deepseek-harness/packages/bundle/web-app')
const yaml = createRequire(join(root, 'vendor/deepseek-harness/packages/settings/settings/package.json'))('yaml')

for (const id of ['standard', 'ptc', 'cordis']) {
  test(`product ${id} does not expose the new host-wide Schedule tools`, () => {
    const source = readFileSync(join(shipped, 'presets', `${id}.patch.yml`), 'utf8')
    const plugins = shippedPresetPlugins(source, yaml)
    const rows = yaml.parseDocument(plugins, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).toJS()
    assert.equal(rows.find(row => row.name === '@deepseek-ai/dsh-tool-schedule').disabled, true)
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
  assert.equal(shippedPresetPlugins(source, yaml), "- id: tool-pwsh\n  name: '@deepseek-ai/dsh-tool-pwsh'\n  disabled: !!js process.platform !== 'win32'\n")
})

test('custom ids, false flags and nested groups cannot enable the host-wide tools', () => {
  const source = "- id: container\n  name: cordis:group\n  config:\n    - id: reminders-renamed\n      name: '@deepseek-ai/dsh-tool-schedule'\n      disabled: false\n- id: shell\n  name: '@deepseek-ai/dsh-tool-pwsh'\n  disabled: !!js process.platform !== 'win32'\n"
  const result = restrictHostScheduleTools(source, yaml)
  const parsed = yaml.parseDocument(result, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }).toJS()
  assert.equal(parsed[0].config[0].disabled, true)
  assert.equal(parsed[1].disabled, "process.platform !== 'win32'")
  assert.match(result, /!!js/)
  assert.equal(restrictHostScheduleTools(result, yaml), result)
})

test('unrecognized official Schedule tool aliases and paths fail closed', () => {
  for (const source of [
    '- id: tool-schedule\n',
    '- id: renamed\n  name: "@deepseek-ai/dsh-tool-schedule/lib/index.js"\n',
    '- id: renamed\n  name: "./node_modules/@deepseek-ai/dsh-tool-schedule/index.js"\n',
  ]) assert.throws(() => restrictHostScheduleTools(source, yaml), /Cannot verify/)
})

test('human Schedule services, unrelated plugins and unevaluated dynamic names remain unchanged', () => {
  const source = '- id: schedule\n  name: "@deepseek-ai/dsh-schedule"\n- id: ui-schedule\n  name: "@deepseek-ai/dsh-client-ui-schedule"\n- id: calendar\n  name: custom-schedule-provider\n- id: dynamic\n  name: !!js getPluginName()\n'
  assert.equal(restrictHostScheduleTools(source, yaml), source)
})

test('the generated custom preset is restricted while its original bytes remain unchanged', t => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-pi-schedule-preset-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const systemRoot = join(directory, 'system'), userRoot = join(directory, 'user')
  mkdirSync(join(systemRoot, 'standard'), { recursive: true })
  mkdirSync(join(userRoot, 'customer'), { recursive: true })
  writeFileSync(join(systemRoot, 'standard/agent.cordis.yml'), '- id: noop\n  name: test-noop\n')
  const path = join(userRoot, 'customer/agent.cordis.yml')
  const original = Buffer.from('- id: customer-reminders\r\n  name: "@deepseek-ai/dsh-tool-schedule"\r\n  disabled: false\r\n')
  writeFileSync(path, original)
  writePresetBundle({ systemRoot, userRoot, ids: ['standard'], parseYaml: yaml.parse, yaml })
  const bundle = yaml.parse(readFileSync(join(systemRoot, 'cordis.patch.yml'), 'utf8'))
  assert.equal(bundle[1].insert[0].config.plugins[0].disabled, true)
  assert.ok(readFileSync(path).equals(original))
  writeFileSync(path, '- id: tool-schedule\n  name: unknown\n')
  const before = readFileSync(join(systemRoot, 'cordis.patch.yml'))
  assert.throws(() => writePresetBundle({ systemRoot, userRoot, ids: ['standard'], parseYaml: yaml.parse, yaml }), /Cannot verify/)
  assert.ok(readFileSync(join(systemRoot, 'cordis.patch.yml')).equals(before))
})
