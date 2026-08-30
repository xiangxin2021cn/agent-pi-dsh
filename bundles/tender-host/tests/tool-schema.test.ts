import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parameterSchemaSpecToJsonSchema } from '../../../vendor/deepseek-harness/packages/core/tools/src/schema.ts'
import { tenderStageParameters } from '../src/tools.ts'

test('execution ledger tool schema compiles under the pinned DSH tool contract', () => {
  const schema = parameterSchemaSpecToJsonSchema(tenderStageParameters)
  const planItems = schema.properties.planItems
  const assignments = schema.properties.assignments

  assert.equal(planItems.type, 'array')
  assert.equal(planItems.items?.type, 'object')
  assert.equal(planItems.items?.additionalProperties, false)
  assert.equal(assignments.type, 'array')
  assert.equal(assignments.items?.type, 'object')
  assert.equal(assignments.items?.additionalProperties, false)
})
