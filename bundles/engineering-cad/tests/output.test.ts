import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cadToolOutput } from '../src/plugin.ts'

test('CAD optional metadata crosses the strict DSH lossless JSON output boundary', () => {
  const result = cadToolOutput({ units: { measurement: undefined, insunits: 4 }, blocks: [{ name: 'A', handle: undefined, xrefPath: undefined }], sourceId: undefined })
  assert.deepEqual(result, { units: { insunits: 4 }, blocks: [{ name: 'A' }] })
  assert.deepEqual(result, JSON.parse(JSON.stringify(result)))
})
test('invalid CAD geometry cannot be silently converted to a valid-looking JSON quantity', () => {
  assert.throws(() => cadToolOutput({ length: NaN }), /非有限/)
  assert.throws(() => cadToolOutput({ point: [1, Infinity] }), /非有限/)
})
