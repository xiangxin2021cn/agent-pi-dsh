import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { migrateSettings017 } from './migrate-settings-017.mjs'
const { parseDocument } = createRequire(new URL('../vendor/deepseek-harness/packages/settings/settings/package.json', import.meta.url))('yaml')

test('legacy settings keep secrets and unrelated providers, migrating only removed fields', () => {
  const document = parseDocument(`agent-presets:
  default: code
  modeSelectionEnabled: false
llm-deepseek:
  protocol: chat-completions
  apiKey: example-not-a-real-key
  models: [{id: deepseek-flash}]
llm-other:
  protocol: custom
`)
  const next = migrateSettings017(document).toJS()
  assert.deepEqual(next['agent-preset-registry'], { selectedDefault: 'standard', modeSelectionEnabled: false })
  assert.deepEqual(next['llm-deepseek'], { apiKey: 'example-not-a-real-key', models: [{ id: 'deepseek-flash' }] })
  assert.equal(next['llm-other'].protocol, 'custom')
  assert.equal(next['agent-presets'], undefined)
  assert.deepEqual(migrateSettings017(document).toJS(), next)
})

test('new registry selections take precedence over legacy values', () => {
  const document = parseDocument('agent-presets: {default: code, modeSelectionEnabled: true}\nagent-preset-registry: {selectedDefault: ptc, modeSelectionEnabled: false}\n')
  assert.deepEqual(migrateSettings017(document).toJS(), {
    'agent-preset-registry': { selectedDefault: 'ptc', modeSelectionEnabled: false },
  })
})

test('Office preference moves to its entry without overwriting a newer choice', () => {
  const old = parseDocument('univer-office: {autoOpenLivePreview: false}\n')
  assert.deepEqual(migrateSettings017(old).toJS(), { univer: { autoOpenLivePreview: false } })
  const mixed = parseDocument('univer-office: {autoOpenLivePreview: true}\nuniver: {autoOpenLivePreview: false, telemetry: false}\n')
  assert.deepEqual(migrateSettings017(mixed).toJS(), { univer: { autoOpenLivePreview: false, telemetry: false } })
})
