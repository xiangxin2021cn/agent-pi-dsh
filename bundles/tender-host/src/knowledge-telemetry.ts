import { join } from 'node:path'
import { projectDir, readJson, writeJson } from './fsutil.ts'
import type { KnowledgeSurface } from './knowledge-surface-router.ts'

export interface KnowledgeTelemetryEvent {
  id: string
  at: string
  operation: 'route' | 'navigate' | 'graph' | 'evidence' | 'coverage' | 'index'
  surfaces: KnowledgeSurface[]
  sourceCount: number
  status: 'ok' | 'fallback' | 'error'
  elapsedMs: number
  modelCalls: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  detail?: string
}

export interface KnowledgeTelemetryLedger {
  schemaVersion: 1
  projectId: string
  events: KnowledgeTelemetryEvent[]
}

export function knowledgeTelemetryPath(cwd: string, projectId: string): string {
  return join(projectDir(cwd, 'tender', projectId), 'orchestration', 'knowledge-telemetry.json')
}

export function loadKnowledgeTelemetry(cwd: string, projectId: string): KnowledgeTelemetryLedger {
  return readJson<KnowledgeTelemetryLedger>(knowledgeTelemetryPath(cwd, projectId), { schemaVersion: 1, projectId, events: [] })
}

export function recordKnowledgeTelemetry(cwd: string, projectId: string, input: Omit<KnowledgeTelemetryEvent, 'id' | 'at'>): KnowledgeTelemetryLedger {
  const ledger = loadKnowledgeTelemetry(cwd, projectId)
  const at = new Date().toISOString()
  const event: KnowledgeTelemetryEvent = {
    ...input,
    id: `${at}-${String(ledger.events.length + 1).padStart(4, '0')}`,
    at,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    modelCalls: Math.max(0, Math.round(input.modelCalls)),
    inputTokens: Math.max(0, Math.round(input.inputTokens)),
    outputTokens: Math.max(0, Math.round(input.outputTokens)),
    estimatedCostUsd: Math.max(0, Number(input.estimatedCostUsd) || 0),
  }
  const next = { ...ledger, events: [...ledger.events, event].slice(-2000) }
  writeJson(knowledgeTelemetryPath(cwd, projectId), next)
  return next
}
