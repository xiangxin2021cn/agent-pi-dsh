import assert from 'node:assert/strict'
import { test } from 'node:test'
import { migrateRetiredDeepSeekSession } from '../src/llm-settings.ts'

const grey = { provider: 'deepseek-official', model: 'deepseek-v4.1-flash-expires-on-0910', reasoningEffort: 'max' }
function session(events: any[]) {
  return { snapshotEvents: () => events, append: (type: string, data: unknown) => events.push({ type, data }) }
}
test('resuming an expired grey conversation records a native selection without rewriting history', () => {
  const events: any[] = [{ type: 'request/header', data: { header: { config: grey } } }]
  const original = structuredClone(events[0])
  const s = session(events)
  assert.equal(migrateRetiredDeepSeekSession(s), true)
  assert.deepEqual(events[0], original)
  assert.deepEqual(events[1], { type: 'model/selection', data: { ...grey, model: 'deepseek-flash' } })
  assert.equal(migrateRetiredDeepSeekSession(s), false)
})
test('the latest explicit choice wins, including another provider with the same model name', () => {
  for (const next of [{ ...grey, model: 'custom' }, { ...grey, provider: 'other' }]) {
    const events = [{ type: 'model/selection', data: grey }, { type: 'model/selection', data: next }]
    assert.equal(migrateRetiredDeepSeekSession(session(events)), false)
    assert.equal(events.length, 2)
  }
  assert.equal(migrateRetiredDeepSeekSession(session([])), false)
})
