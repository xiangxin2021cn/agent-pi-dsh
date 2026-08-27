import { isAbsolute, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { TenderCapabilityId } from '../../packages/business-core/src/tender/index.ts'
import { repoRoot } from './root.ts'

export const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export const CAPABILITY_FILE_NAMES: Record<TenderCapabilityId, string> = {
  document_analysis: 'document-analysis',
  evaluation_strategy: 'evaluation-strategy',
  boq_reconciliation: 'boq-reconciliation',
  project_boundary: 'project-boundary',
  boq_five_step_pricing: 'boq-five-step-pricing',
  construction_resource_schedule: 'construction-resource-schedule',
  bidder_commitments: 'bidder-commitments',
  execution_plan: 'execution-plan',
  schedule_resources: 'schedule-resources',
  cost_cashflow: 'cost-cashflow',
  submission_documents: 'submission-documents',
  submission_audit: 'submission-audit',
}

export function projectDir(cwd: string, module: string, projectId: string): string {
  return resolve(cwd, '.agent-pi', 'business', module, projectId)
}

export function tenderDir(cwd: string, projectId: string): string {
  return projectDir(cwd, 'tender', projectId)
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(join(path, '..'))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function resolveMaybe(cwd: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path)
}

export function knowledgeRoot(): string {
  return resolve(repoRoot(), 'knowledge')
}
