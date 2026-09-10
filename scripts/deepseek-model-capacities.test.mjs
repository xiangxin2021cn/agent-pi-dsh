import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  DEEPSEEK_MODEL_CAPACITIES,
  repairDeepSeekModelCapacities,
  ensureDeepSeekOfficialModel,
  migrateDeepSeekDefault,
} from './deepseek-model-capacities.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const GREY = 'deepseek-v4.1-flash-expires-on-0910'

test('official model replaces expired grey entry and preserves custom models, credentials, and CRLF', () => {
  const source = `llm-deepseek:\r\n  models:\r\n    - id: '${GREY}' # retired\r\n      maxTokens: 384000\r\n    - id: custom-model\r\n      maxTokens: 1234\r\n  baseURL: https://example.invalid\r\nagent-default-model:\r\n  provider: deepseek-official\r\n  model: '${GREY}' # selection\r\n  reasoningEffort: max\r\n`
  const result = migrateDeepSeekDefault(ensureDeepSeekOfficialModel(source))
  assert.ok(!result.includes(GREY))
  assert.ok(result.includes('    - id: custom-model\r\n      maxTokens: 1234\r\n  baseURL: https://example.invalid'))
  assert.ok(result.includes('  model: deepseek-flash # selection\r\n  reasoningEffort: max'))
  assert.ok(result.includes('inputModalities: [text, image]\r\n      systemPromptUpdate: in-history'))
  assert.equal(migrateDeepSeekDefault(ensureDeepSeekOfficialModel(result)), result)
})

test('new profiles inherit official catalog and explicit custom selections remain intact', () => {
  for (const source of ['llm-deepseek:\n  apiKeyEnv: MY_KEY\n', 'other:\n  models: []\n', '']) {
    assert.equal(ensureDeepSeekOfficialModel(source), source)
  }
  const source = 'agent-default-model:\n  provider: other\n  model: deepseek-v4-flash\n'
  assert.equal(migrateDeepSeekDefault(source), source)
  assert.equal(migrateDeepSeekDefault('agent-default-model:\n  model: custom-model\n'), 'agent-default-model:\n  model: custom-model\n')
  for (const old of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', GREY]) {
    assert.equal(migrateDeepSeekDefault(`agent-default-model:\n  model: ${old}`), 'agent-default-model:\n  model: deepseek-flash')
  }
})

test('existing official model wins over the retired entry and keeps custom limits', () => {
  const source = `llm-deepseek:\n  models:\n    - id: deepseek-flash\n      maxTokens: 8192\n      contextWindow: 500000\n    - id: ${GREY}\n      maxTokens: 384000\n`
  const result = repairDeepSeekModelCapacities(ensureDeepSeekOfficialModel(source)).yaml
  assert.equal(result.match(/- id:/g).length, 1)
  assert.match(result, /maxTokens: 8192/)
  assert.match(result, /contextWindow: 500000/)
  assert.match(result, /inputModalities: \[text, image\]/)
  assert.match(result, /systemPromptUpdate: in-history/)
  assert.equal(repairDeepSeekModelCapacities(result).changed, false)
})

test('empty user catalogs receive official native image capabilities with the upstream output default', () => {
  const result = repairDeepSeekModelCapacities(ensureDeepSeekOfficialModel('llm-deepseek:\n  models: []\n')).yaml
  assert.match(result, /- id: deepseek-flash/)
  assert.match(result, /maxTokens: 256000/)
  assert.match(result, /systemPromptUpdate: in-history/)
})

const officialFields = `      contextWindow: 1000000
      maxTokens: 384000
`

test('inserts official capacities for all three exact DeepSeek models', () => {
  const source = `llm-deepseek:
  models:
    - id: deepseek-v4-flash
      name: Flash
    - id: deepseek-v4-pro
      name: Pro
    - id: deepseek-v4-flash-vision-exp
      name: Vision
other:
  keep: unchanged
`
  const expected = source.replace(
    /^(    - id: deepseek-v4-(?:flash|pro|flash-vision-exp)\n)/gm,
    `$1${officialFields}`,
  )

  assert.deepEqual(DEEPSEEK_MODEL_CAPACITIES['deepseek-v4-flash'], {
    contextWindow: 1_000_000,
    maxTokens: 384_000,
  })
  assert.deepEqual(repairDeepSeekModelCapacities(source), {
    yaml: expected,
    changed: true,
  })
})

test('inserts only a missing field and preserves an existing numeric value', () => {
  const source = `llm-deepseek:
  models:
    - id: deepseek-v4-flash
      contextWindow: 777777
      name: Flash
`
  const result = repairDeepSeekModelCapacities(source)

  assert.equal(result.changed, true)
  assert.match(result.yaml, /contextWindow: 777777/)
  assert.match(result.yaml, /maxTokens: 384000/)
  assert.equal(result.yaml.match(/contextWindow:/g)?.length, 1)
})

test('preserves user-modified numeric values for both fields', () => {
  const source = `llm-deepseek:
  models:
    - id: deepseek-v4-pro
      contextWindow: 654321
      maxTokens: 123456
`

  assert.deepEqual(repairDeepSeekModelCapacities(source), {
    yaml: source,
    changed: false,
  })
})

test('preserves exact quoted capacity keys without inserting duplicates', () => {
  const source = `llm-deepseek:
  models:
    - id: deepseek-v4-flash
      "contextWindow": 777777
      'maxTokens': 123456
`

  assert.deepEqual(repairDeepSeekModelCapacities(source), {
    yaml: source,
    changed: false,
  })
})

test('leaves near-match models and out-of-scope provider blocks byte-stable', () => {
  const source = `llm-deepseek:
  models:
    - id: deepseek-v4-flash-custom
      name: Custom
    - id: __proto__
      name: Prototype key
    - id: constructor
      name: Constructor key
wrapper:
  llm-deepseek:
    models:
      - id: deepseek-v4-flash
        name: Nested
other-provider:
  models:
    - id: deepseek-v4-pro
      name: Other
`.replaceAll('\n', '\r\n')

  assert.deepEqual(repairDeepSeekModelCapacities(source), {
    yaml: source,
    changed: false,
  })
})

test('second repair is byte-identical and reports no change', () => {
  const source = `# keep this header
llm-deepseek:
  models:
    - id: "deepseek-v4-flash-vision-exp"
      name: Vision
tail: value
`
  const once = repairDeepSeekModelCapacities(source)
  const twice = repairDeepSeekModelCapacities(once.yaml)

  assert.equal(once.changed, true)
  assert.equal(twice.changed, false)
  assert.equal(twice.yaml, once.yaml)
})

test('initializer inherits the official catalog and migrates existing user settings', () => {
  const init = readFileSync(join(root, 'scripts/init-tender-profile.mjs'), 'utf8')
  assert.doesNotMatch(init, /- id: llm-deepseek|expires-on-0910|OFFICIAL_VISION_MODEL/)
  assert.match(init, /ensureDeepSeekOfficialModel\(next\)/)
  assert.match(init, /migrateDeepSeekDefault\(withCatalog\)/)
  assert.ok(init.lastIndexOf('repairExistingDeepSeekModelCapacities()') > init.lastIndexOf('writeManagedPatch(dependencies)'))
})
