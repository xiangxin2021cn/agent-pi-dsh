import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  DEEPSEEK_MODEL_CAPACITIES,
  repairDeepSeekModelCapacities,
  ensureDeepSeekGreyModel,
  DEEPSEEK_GREY_MODEL,
} from './deepseek-model-capacities.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('grey model extends an existing catalog without changing custom limits or default', () => {
  const source = 'llm-deepseek:\r\n  models:\r\n    - id: custom-model\r\n      maxTokens: 1234\r\n  baseURL: https://example.invalid\r\nagent-default-model:\r\n  model: custom-model\r\n'
  const result = ensureDeepSeekGreyModel(source)
  assert.ok(result.includes(DEEPSEEK_GREY_MODEL))
  assert.ok(result.endsWith(source.slice(source.indexOf('    - id: custom-model'))))
  assert.equal(ensureDeepSeekGreyModel(result), result)
  assert.equal(ensureDeepSeekGreyModel('llm-deepseek:\n  apiKey: secret\n'), 'llm-deepseek:\n  apiKey: secret\n')
  assert.equal(ensureDeepSeekGreyModel('other:\n  models: []\n'), 'other:\n  models: []\n')
})

test('grey model supports an empty catalog and leaves an explicit existing entry intact', () => {
  assert.match(ensureDeepSeekGreyModel('llm-deepseek:\n  models: []\n'), /models: *\n    - id: deepseek-v4\.1/)
  const explicit = `llm-deepseek:\n  models:\n    - id: '${DEEPSEEK_GREY_MODEL}' # custom\n      maxTokens: 8192\n`
  assert.equal(ensureDeepSeekGreyModel(explicit), explicit)
  assert.equal(DEEPSEEK_MODEL_CAPACITIES[DEEPSEEK_GREY_MODEL], undefined)
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

test('initializer templates official fields and repairs settings after managed patch', () => {
  const init = readFileSync(join(root, 'scripts/init-tender-profile.mjs'), 'utf8')
  assert.match(init, /deepseek-v4-flash-vision-exp[\s\S]*?contextWindow: 1000000[\s\S]*?maxTokens: 384000/)
  assert.match(init, /deepseek-v4-flash\r?\n[\s\S]*?contextWindow: 1000000[\s\S]*?maxTokens: 384000/)
  assert.match(init, /deepseek-v4-pro\r?\n[\s\S]*?contextWindow: 1000000[\s\S]*?maxTokens: 384000/)
  assert.match(init, /if \(repaired\.changed\) writeFileSync\(settingsPath, repaired\.yaml\)/)
  assert.ok(init.lastIndexOf('repairExistingDeepSeekModelCapacities()')
    > init.lastIndexOf('writeManagedPatch(dependencies)'))
})
