import assert from 'node:assert/strict'
import { test } from 'node:test'
import { taskExecutionProjection } from '../src/execution.ts'

test('execution projection binds the original session and excludes prompts, monetary caps and tool arguments', () => {
  const status: any = { phase: 'needs_review', reason: 'Actual receipt pending', run: { sessionId: 'original', stageId: 'review', limits: { maxRounds: 64, maxTokens: 500000, maxElapsedMs: 7200000, maxNoProgress: 3, maxCostUsd: 1 }, usage: { rounds: 2, tokens: 90, elapsedMs: 1000, unknownTokens: true, knownCostUsd: 12 }, noProgress: 1 }, attempt: { id: 'one', status: 'dispatched', inputFingerprint: 'hash', draft: 'private prompt', pendingToolCalls: ['private-tool-call'], children: { pending: {}, done: { settledAt: 'now' } }, context: { fingerprint: 'context-hash', knowledge: [1], templates: [1], skills: [1,2], policyState: 'configured' } } }
  const result = taskExecutionProjection('original', status)
  assert.equal(result.pendingToolCount, 1)
  assert.equal(result.unsettledChildCount, 1)
  assert.equal(result.usage!.unknownTokens, true)
  assert.equal(result.context!.skillCount, 2)
  assert.doesNotMatch(JSON.stringify(result), /private|draft|maxCostUsd|knownCostUsd/)
  assert.throws(() => taskExecutionProjection('foreign', status), /原主会话/)
  assert.equal(taskExecutionProjection('original', { phase: 'inactive', reason: 'Not started', cost: 'unknown' }).attempt, undefined)
})
