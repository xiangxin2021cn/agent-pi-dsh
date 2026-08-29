import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadKnowledgeTelemetry, recordKnowledgeTelemetry } from '../src/knowledge-telemetry.ts'

test('logs comparable knowledge calls, tokens, time and estimated cost per project', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-knowledge-telemetry-'))
  recordKnowledgeTelemetry(cwd, 'p1', {
    operation: 'navigate',
    surfaces: ['document'],
    sourceCount: 2,
    status: 'ok',
    elapsedMs: 12.4,
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    detail: 'deterministic PageIndex tree search',
  })
  assert.equal(loadKnowledgeTelemetry(cwd, 'p1').events[0]?.elapsedMs, 12)
  assert.equal(loadKnowledgeTelemetry(cwd, 'p2').events.length, 0)
})
