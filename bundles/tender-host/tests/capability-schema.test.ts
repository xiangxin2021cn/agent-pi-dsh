import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  BOQ_FIVE_STEP_PRICING_NOT_TOP_LEVEL,
  BOQ_FIVE_STEP_PRICING_TOP_LEVEL_REQUIRED,
  capabilitySchemaHint,
  wrapCapabilityParseError,
} from '../src/capability-schema.ts'

test('schema hint lists only the allowed top-level pricing keys', () => {
  const hint = capabilitySchemaHint('boq_five_step_pricing')
  assert.deepEqual(hint.topLevel?.required, [...BOQ_FIVE_STEP_PRICING_TOP_LEVEL_REQUIRED])
  assert.equal(hint.notTopLevel?.rateBasis, 'itemBuildUps[].costComponents[].rateBasis')
  assert.equal(hint.notTopLevel?.planningBasis, 'itemBuildUps[].planningBasis')
  assert.match(hint.notTopLevel?.sources ?? '', /does not exist/)
  assert.equal(hint.webRateCheck?.required, true)
  assert.ok(hint.webRateCheck?.tools.includes('web_search'))
  assert.ok(hint.webRateCheck?.tools.includes('anysearch_batch_search'))
  assert.equal(hint.saLabourWageCheck?.anysearch.zone, 'intl')
  assert.match(hint.saLabourWageCheck?.skillReference ?? '', /sa-labour-wages\.md/)
  assert.ok(hint.localIntelCheck?.tools.includes('anysearch_capabilities'))
  assert.match(hint.localIntelCheck?.officialOutputs.join(' ') ?? '', /当地供应商尽调/)
})

test('replace error names the real paths for rejected top-level keys', () => {
  const error = wrapCapabilityParseError(
    'boq_five_step_pricing',
    new Error('Unrecognized key: "rateBasis"'),
  )
  assert.match(error.message, /rateBasis/)
  assert.match(error.message, /itemBuildUps\[\]\.costComponents\[\]\.rateBasis/)
  assert.match(error.message, /currency/)
  assert.match(error.message, /itemBuildUps/)
  for (const key of Object.keys(BOQ_FIVE_STEP_PRICING_NOT_TOP_LEVEL)) {
    assert.match(error.message, new RegExp(key))
  }
})

test('skill ships the schema reference the model was told to read', () => {
  const skillDir = join(dirname(fileURLToPath(import.meta.url)), '../../../skills/tender-boq-five-step-pricing')
  const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
  const schema = readFileSync(join(skillDir, 'references/schema.md'), 'utf8')
  assert.match(skill, /references\/schema\.md/)
  assert.match(skill, /action: schema/)
  assert.match(schema, /Top-level object/)
  assert.match(schema, /rateBasis/)
  assert.match(schema, /planningBasis/)
  assert.match(schema, /sources/)
  assert.match(skill, /sa-labour-wages\.md/)
  assert.match(skill, /local-site-intel\.md/)
  assert.match(skill, /local-productivity\.md/)
  assert.match(skill, /supplier-rfq\.md/)
  assert.match(skill, /waive_pricing/)
  assert.match(skill, /anysearch_capabilities/)
  assert.match(skill, /anysearch_batch_search/)
  assert.match(skill, /zone: "intl"/)
  const labour = readFileSync(join(skillDir, 'references/sa-labour-wages.md'), 'utf8')
  assert.match(labour, /BCCEI/)
  assert.match(labour, /zone: "intl"/)
  assert.doesNotMatch(labour, /R250/)
  const intel = readFileSync(join(skillDir, 'references/local-site-intel.md'), 'utf8')
  assert.match(intel, /anysearch_capabilities/)
  assert.match(intel, /项目特征/)
  const productivity = readFileSync(join(skillDir, 'references/local-productivity.md'), 'utf8')
  assert.match(productivity, /international_adjusted/)
  assert.match(productivity, /Chinese/)
  assert.match(productivity, /anysearch_batch_search/)
  assert.match(productivity, /Enterprise file first/)
  assert.match(skill, /enterprise file/i)
  const rfq = readFileSync(join(skillDir, 'references/supplier-rfq.md'), 'utf8')
  assert.match(rfq, /当地供应商尽调/)
  assert.match(rfq, /English/)
  assert.match(rfq, /组价依据说明/)
})
