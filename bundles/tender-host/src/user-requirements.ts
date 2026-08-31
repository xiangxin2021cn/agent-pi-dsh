import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  listBusinessProjects,
  type BusinessProjectRecord,
} from '../../../packages/business-projects/index.ts'
import { projectDir, readJson, writeJson } from './fsutil.ts'

export type UserRequirementStatus = 'active' | 'implemented' | 'accepted' | 'dismissed'

export interface UserRequirement {
  id: string
  projectId: string
  module: string
  stageId: string
  sessionId: string
  text: string
  status: UserRequirementStatus
  createdAt: string
  updatedAt: string
  implementedAt?: string
  acceptedAt?: string
  dismissedAt?: string
  note?: string
  evidencePaths?: string[]
}

export interface UserRequirementBinding {
  sessionId: string
  stageId: string
  boundAt: string
  updatedAt: string
}

export interface UserRequirementLedger {
  schemaVersion: 1
  projectId: string
  module: string
  bindings: Record<string, UserRequirementBinding>
  requirements: UserRequirement[]
  updatedAt: string
}

function ledgerPath(cwd: string, project: Pick<BusinessProjectRecord, 'module' | 'projectId'>): string {
  return join(projectDir(cwd, project.module, project.projectId), 'orchestration', 'user-requirements.json')
}

function emptyLedger(project: Pick<BusinessProjectRecord, 'module' | 'projectId'>): UserRequirementLedger {
  return {
    schemaVersion: 1,
    projectId: project.projectId,
    module: project.module,
    bindings: {},
    requirements: [],
    updatedAt: new Date().toISOString(),
  }
}

function textOf(value: unknown): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, 16_000)
}

function requirementId(sessionId: string, stageId: string, text: string): string {
  return `req-${createHash('sha256').update(`${sessionId}\n${stageId}\n${text}`).digest('hex').slice(0, 16)}`
}

export function loadUserRequirementLedger(
  cwd: string,
  project: Pick<BusinessProjectRecord, 'module' | 'projectId'>,
): UserRequirementLedger {
  const fallback = emptyLedger(project)
  const raw = readJson<Partial<UserRequirementLedger>>(ledgerPath(cwd, project), fallback)
  return {
    schemaVersion: 1,
    projectId: project.projectId,
    module: project.module,
    bindings: raw.bindings && typeof raw.bindings === 'object' ? raw.bindings : {},
    requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
    updatedAt: textOf(raw.updatedAt) || fallback.updatedAt,
  }
}

function saveUserRequirementLedger(cwd: string, project: BusinessProjectRecord, ledger: UserRequirementLedger): void {
  ledger.updatedAt = new Date().toISOString()
  writeJson(ledgerPath(cwd, project), ledger)
}

export function bindUserRequirementSession(
  cwd: string,
  project: BusinessProjectRecord,
  sessionId: string,
  stageId = '',
): UserRequirementBinding | null {
  const id = textOf(sessionId)
  if (!id) return null
  const ledger = loadUserRequirementLedger(cwd, project)
  const now = new Date().toISOString()
  const previous = ledger.bindings[id]
  const binding: UserRequirementBinding = {
    sessionId: id,
    stageId: textOf(stageId) || previous?.stageId || '',
    boundAt: previous?.boundAt || now,
    updatedAt: now,
  }
  ledger.bindings[id] = binding
  saveUserRequirementLedger(cwd, project, ledger)
  return binding
}

export function projectBoundToSession(cwd: string, sessionId: string): BusinessProjectRecord | null {
  const id = textOf(sessionId)
  if (!id) return null
  const matches = listBusinessProjects(cwd).flatMap((project) => {
    const binding = loadUserRequirementLedger(cwd, project).bindings[id]
    return binding ? [{ project, updatedAt: binding.updatedAt }] : []
  })
  matches.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  return matches[0]?.project ?? null
}

export function listUserRequirements(
  cwd: string,
  project: BusinessProjectRecord,
  stageId?: string,
): UserRequirement[] {
  const rows = loadUserRequirementLedger(cwd, project).requirements
    .filter((row) => !stageId || row.stageId === stageId)
  return rows.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function activeUserRequirements(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): UserRequirement[] {
  return listUserRequirements(cwd, project, stageId).filter((row) => row.status === 'active')
}

export function acceptedUserRequirementOverride(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): boolean {
  return listUserRequirements(cwd, project, stageId).some((row) => row.status === 'accepted')
}

export function recordUserRequirement(
  cwd: string,
  project: BusinessProjectRecord,
  input: { sessionId: string; stageId: string; text: string },
): { requirement: UserRequirement; created: boolean } {
  const sessionId = textOf(input.sessionId)
  const stageId = textOf(input.stageId)
  const text = textOf(input.text)
  if (!sessionId) throw new Error('记录用户要求需要明确的主会话。')
  if (!stageId) throw new Error('记录用户要求需要明确的项目阶段。')
  if (!text) throw new Error('用户要求不能为空。')
  const ledger = loadUserRequirementLedger(cwd, project)
  const id = requirementId(sessionId, stageId, text)
  const existing = ledger.requirements.find((row) => row.id === id)
  const now = new Date().toISOString()
  if (existing) {
    if (existing.status === 'active') return { requirement: existing, created: false }
    existing.status = 'active'
    existing.updatedAt = now
    delete existing.implementedAt
    delete existing.acceptedAt
    delete existing.dismissedAt
    delete existing.note
    delete existing.evidencePaths
    ledger.bindings[sessionId] = {
      sessionId,
      stageId,
      boundAt: ledger.bindings[sessionId]?.boundAt || now,
      updatedAt: now,
    }
    saveUserRequirementLedger(cwd, project, ledger)
    return { requirement: existing, created: true }
  }
  const row: UserRequirement = {
    id,
    projectId: project.projectId,
    module: project.module,
    stageId,
    sessionId,
    text,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  ledger.requirements.unshift(row)
  ledger.bindings[sessionId] = {
    sessionId,
    stageId,
    boundAt: ledger.bindings[sessionId]?.boundAt || now,
    updatedAt: now,
  }
  saveUserRequirementLedger(cwd, project, ledger)
  return { requirement: row, created: true }
}

export function updateUserRequirement(
  cwd: string,
  project: BusinessProjectRecord,
  requirementIdValue: string,
  status: UserRequirementStatus,
  options: { note?: string; evidencePaths?: string[] } = {},
): UserRequirement {
  const id = textOf(requirementIdValue)
  const ledger = loadUserRequirementLedger(cwd, project)
  const row = ledger.requirements.find((item) => item.id === id)
  if (!row) throw new Error(`未找到用户要求 ${id}`)
  const now = new Date().toISOString()
  row.status = status
  row.updatedAt = now
  row.note = textOf(options.note) || undefined
  row.evidencePaths = Array.isArray(options.evidencePaths)
    ? options.evidencePaths.map(textOf).filter(Boolean).slice(0, 40)
    : status === 'active' ? undefined : row.evidencePaths
  delete row.implementedAt
  delete row.acceptedAt
  delete row.dismissedAt
  if (status === 'implemented') row.implementedAt = now
  if (status === 'accepted') row.acceptedAt = now
  if (status === 'dismissed') row.dismissedAt = now
  saveUserRequirementLedger(cwd, project, ledger)
  return row
}
