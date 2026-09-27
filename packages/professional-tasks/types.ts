export type Profession = 'general' | 'tender' | 'drawing' | 'quantity' | 'method' | 'research' | 'report' | 'spreadsheet'
export type CheckStatus = 'passed' | 'failed' | 'review'
export interface Evidence {
  id: string
  title: string
  value: string
  kind: 'source' | 'web' | 'derived' | 'assumption'
  status: 'verified' | 'unverified' | 'conflict'
  locator?: string
  url?: string
  accessedAt?: string
  effectiveDate?: string
  region?: string
  applicable?: boolean
  basis?: string
  dependsOn?: string[]
}
export interface ProjectBasis {
  country: string
  location: string
  employer: string
  procurement: string
  funding: string
  contract: string
  measurement: string
  standards: Array<{ id: string; title: string; version: string; scope: string; evidenceId: string }>
  precedence: string[]
}
export interface TaskBrief {
  objective: string
  scope: string
  audience: string
  formats: string[]
  language: string
  deadline: string
  profession: Profession
  basis: ProjectBasis
  webDiligence: 'ask' | 'allowed' | 'forbidden'
}
export interface TaskRequirement {
  id: string
  title: string
  kind: 'condition' | 'score' | 'returnable' | 'acceptance'
  evidenceIds: string[]
  mandatory: boolean
  template?: string
  signatureRequired?: boolean
}
export interface Coverage {
  id: string
  title: string
  version: string
  locator: string
  kind: 'page' | 'table' | 'drawing' | 'attachment' | 'file'
  status: 'parsed' | 'unreadable' | 'missing' | 'superseded'
  review?: 'pending' | 'reviewed'
}
export interface PlanStep {
  id: string
  title: string
  capabilityIds: string[]
  dependsOn: string[]
  evidenceIds: string[]
  requirementIds: string[]
  status: 'pending' | 'working' | 'done' | 'blocked' | 'needs_review'
  gaps: string[]
  supplements: string[]
}
export interface Deliverable {
  id: string
  title: string
  path: string
  requirementIds: string[]
  evidenceIds: string[]
  stepIds: string[]
  status: 'draft' | 'reviewed' | 'accepted' | 'stale'
  signature: 'not_required' | 'pending' | 'signed'
  checks: Array<{ kind: 'file' | 'format' | 'coverage' | 'calculation' | 'professional' | 'writing' | 'signature'; status: CheckStatus; detail: string; fingerprint?: string }>
}
export interface ProfessionalTask {
  schemaVersion: 1
  sessionId: string
  revision: number
  needsAssessment: boolean
  latestRequest: string
  brief: TaskBrief
  questions: Array<{ id: string; question: string; answer?: string }>
  evidence: Evidence[]
  requirements: TaskRequirement[]
  coverage: Coverage[]
  plan: PlanStep[]
  deliverables: Deliverable[]
  assessment: string
  updatedAt: string
}
export interface Capability {
  id: string
  owner: string
  version: string
  title: string
  description: string
  professions: Profession[]
  tools: string[]
  skills: string[]
  inputs: string[]
  outputs: string[]
  limitations: string[]
  supplements: string[]
  applicability?: { countries?: string[]; standards?: string[]; excludedCountries?: string[] }
  module?: string
}
