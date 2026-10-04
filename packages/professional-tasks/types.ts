export type Profession = 'general' | 'tender' | 'drawing' | 'quantity' | 'method' | 'research' | 'report' | 'spreadsheet'
export type CheckStatus = 'passed' | 'failed' | 'review'
export interface Evidence {
  id: string
  title: string
  value: string
  kind: 'source' | 'web' | 'derived' | 'assumption'
  status: 'verified' | 'unverified' | 'conflict'
  locator?: string
  sourcePath?: string
  sourceHash?: string
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
  checkSpec?: QualityCriterion
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
  briefDependencies?: Array<keyof TaskBrief>
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
  briefDependencies?: Array<keyof TaskBrief>
}
export interface BriefProvenance {
  origin: 'user' | 'source' | 'inference' | 'legacy'
  status: 'explicit' | 'provisional' | 'confirmed' | 'conflict'
  messageId?: string
  evidenceIds?: string[]
  updatedRevision: number
}
export interface TaskFinding {
  id: string
  title: string
  summary: string
  goalImpact: string
  evidenceIds: string[]
  requirementIds?: string[]
  stepIds?: string[]
  actions?: Array<{ id?: string; label: string; kind?: 'source' | 'question' | 'action'; target?: string }>
  status: 'open' | 'resolved' | 'superseded'
  importance?: 'critical' | 'normal'
  resolution?: string
  createdRevision: number
  updatedRevision: number
  source?: { engine?: string; runId?: string; turnId?: string; toolCallId?: string }
}
export interface QualityCriterion {
  id: string
  title: string
  kind: 'file' | 'contains' | 'json' | 'review'
  path?: string
  expected?: string
  evidenceIds?: string[]
  requirementIds?: string[]
  briefDependencies?: Array<keyof TaskBrief>
}
export interface QualityCheck {
  id: string
  status: CheckStatus
  detail: string
  path?: string
  sha256?: string
  inputFingerprint?: string
  checkedAt?: string
  stale?: boolean
}
export interface TaskQuality {
  enabled: boolean
  brief: Record<'purpose' | 'depth' | 'evidence' | 'format' | 'acceptance', string>
  criteria: QualityCriterion[]
  checks: QualityCheck[]
  checkedRevision: number | null
  reviewNotes: string
  needsAssessment: boolean
  template?: { id: string; title: string; content: string }
}
export interface TaskBinding {
  projectId: string
  moduleId: string
  cwd?: string
  stageId?: string
  workflowRevision?: string | number
  projectGoal?: string
  stageLabel?: string
  terminalDeliverables?: string[]
}
export interface TaskChange {
  sequence: number
  revision: number
  at: string
  source: 'user' | 'agent' | 'host' | 'migration'
  summary: string
  changedRefs: string[]
  affectedRefs: string[]
  operationId?: string
}
export interface ProfessionalTask {
  schemaVersion: 2
  sessionId: string
  revision: number
  needsAssessment: boolean
  latestRequest: string
  latestMessageId?: string
  brief: TaskBrief
  questions: Array<{ id: string; question: string; answer?: string; provider?: string; requestId?: string; callId?: string; purpose?: string; status?: 'pending' | 'open' | 'continued' | 'answered' | 'expired' | 'cancelled'; askedRevision?: number; answerSource?: 'user' | 'native'; decisionScope?: { cwd: string; projectId: string; moduleId: string; stageId: string; fingerprint: string; approveLabel: string; rejectLabel?: string } }>
  evidence: Evidence[]
  requirements: TaskRequirement[]
  coverage: Coverage[]
  plan: PlanStep[]
  deliverables: Deliverable[]
  assessment: string
  updatedAt: string
  briefProvenance: Record<string, BriefProvenance>
  findings: TaskFinding[]
  quality: TaskQuality
  binding?: TaskBinding
  pendingProjectSync?: { id: string; text: string; stageId?: string; messageId?: string; createdAt: string }
  recentChanges: TaskChange[]
  operationReceipts: Array<{ id: string; digest: string; revision: number }>
  migration?: { schema1?: boolean; depth?: boolean; depthPurposeConflict?: string }
  acceptedHistory: Array<{ revision: number; at: string; deliverable: Deliverable }>
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
