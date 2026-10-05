export interface EngineeringSource {
  id: string
  title: string
  path?: string
  sha256: string
  revision?: string
  status: 'active' | 'superseded' | 'unreadable'
}

/** The hash belongs to the bytes actually inspected, not the latest file automatically. */
export interface EngineeringSourceRef {
  sourceId: string
  sourceHash: string
  locator: string
}

export interface EngineeringParameter {
  value: string | number | boolean | null
  unit?: string
  status: 'confirmed' | 'provisional' | 'conflict'
  sources: EngineeringSourceRef[]
}

export interface EngineeringObject {
  id: string
  type: string
  title: string
  parameters: Record<string, EngineeringParameter>
  sources: EngineeringSourceRef[]
}

/** Adopt another id to change rules; previously adopted versions remain reproducible. */
export interface EngineeringRuleAdoption {
  id: string
  packId: string
  version: string
  contentHash: string
  scope: { country: string; discipline: string; region?: string }
  adoptedAt: string
  sources: EngineeringSourceRef[]
}

export type EngineeringDependency =
  | { kind: 'source' | 'object' | 'rule' | 'quantity'; id: string }
  | { kind: 'parameter'; id: string; parameter: string }

export type EngineeringQuantityPurpose = 'geometric' | 'fabrication' | 'contract' | 'procurement'
export interface EngineeringQuantity {
  id: string
  title: string
  objectIds: string[]
  purpose: EngineeringQuantityPurpose
  value: number | null
  unit: string
  formula: string
  dependencies: EngineeringDependency[]
  inputFingerprint?: string
  status: 'draft' | 'reviewed' | 'stale' | 'blocked'
  issues: string[]
}

export interface EngineeringCoverage {
  id: string
  title: string
  required: boolean
  status: 'pending' | 'reviewed' | 'missing' | 'excluded' | 'stale'
  reason?: string
  dependencies: EngineeringDependency[]
  inputFingerprint?: string
}

export interface EngineeringProject {
  schemaVersion: 1
  id: string
  title: string
  revision: number
  sources: EngineeringSource[]
  objects: EngineeringObject[]
  quantities: EngineeringQuantity[]
  ruleAdoptions: EngineeringRuleAdoption[]
  coverage: EngineeringCoverage[]
}

/** Arrays replace their corresponding collection; omitted collections are preserved. */
export type EngineeringProjectPatch = Partial<Pick<EngineeringProject, 'title' | 'sources' | 'objects' | 'quantities' | 'ruleAdoptions' | 'coverage'>>

export interface EngineeringIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
  entityId?: string
}

export interface EngineeringProviderMetadata {
  id: string
  version: string
  title: string
  inputDescription?: string
  /** Versions are exact requirements; no implicit latest or semver range resolution. */
  dependencies: Array<{ id: string; version?: string }>
  limitations: string[]
}

export interface EngineeringExecutionContext {
  cwd?: string
  signal?: AbortSignal
  dependencies?: readonly EngineeringDependency[]
  previousRuns: readonly { providerId: string; output: { details: unknown } }[]
}

export interface EngineeringProvider extends EngineeringProviderMetadata {
  parse: (input: unknown) => unknown
  audit: (data: unknown, project: EngineeringProject) => EngineeringIssue[]
  execute?: (data: unknown, project: EngineeringProject, context?: EngineeringExecutionContext) => unknown | Promise<unknown>
}
