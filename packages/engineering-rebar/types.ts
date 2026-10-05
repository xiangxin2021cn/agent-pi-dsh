export type LengthUnit = 'mm' | 'm'
export type QuantityBasis = 'geometry' | 'measurement' | 'fabrication'

export interface RebarSourceRef {
  documentId: string
  revision?: string
  sha256?: string
  page?: number
  sheet?: string
  cell?: string
  entityId?: string
  note?: string
}

export interface LengthValue { value: string; unit: LengthUnit }
export type CenterlineSegment = { kind: 'line'; length: string } | { kind: 'arc'; radius: string; angleDegrees: string }
export interface CenterlineShape { dimensionBasis: 'centerline'; unit: LengthUnit; segments: CenterlineSegment[] }
export interface SpacingZone {
  id: string
  start: string
  end: string
  spacing: string
  unit: LengthUnit
  includeStart: boolean
  /** Include the end position even when it is not on the spacing grid. */
  includeEnd: boolean
}

export interface RebarRuleRef {
  id: string
  version: string
  fingerprint: string
  standardRefs: string[]
  errataFingerprint?: string
  reviewStatus: 'draft' | 'reviewed'
  adopted: boolean
  sourceRefs: RebarSourceRef[]
}
export interface RebarDerivation {
  basis: QuantityBasis
  terms: { parameter: string; inputValue: string; inputUnit: LengthUnit; multiplier: string; lengthM: string; sourceRefs: RebarSourceRef[] }[]
}

export interface RebarRowInput {
  id: string
  hostId?: string
  mark?: string
  /** Same physical steel group across BBS and drawing derivation. Collisions require reconciliation. */
  identityKey?: string
  inputMode: 'bbs' | 'pingfa'
  role?: string
  diameterMm?: string | null
  steelGrade?: string | null
  count?: number | null
  countPerHost?: number | null
  hostCount?: number | null
  spacingZones?: SpacingZone[]
  shape?: CenterlineShape
  lengths?: Partial<Record<QuantityBasis, LengthValue | null>>
  unitMassKgPerM?: string | null
  sourceRefs: RebarSourceRef[]
  rule?: RebarRuleRef
  derivation?: RebarDerivation[]
  /** Explicit unresolved inputs; no result is eligible for release while these remain. */
  missingInputs?: string[]
}

export interface RebarInput {
  schemaVersion: 1
  projectId?: string
  rows: RebarRowInput[]
  coverage?: { expectedGroupIds: string[]; excluded?: { id: string; reason: string }[] }
}

export interface RebarIssue {
  code: string
  severity: 'error' | 'warning'
  rowId?: string
  parameter?: string
  message: string
}
export interface RebarBasisResult {
  singleLengthM: string | null
  totalLengthM: string | null
  totalMassKg: string | null
}
export interface RebarRowResult {
  id: string
  hostId?: string
  mark?: string
  role?: string
  diameterMm?: string | null
  steelGrade?: string | null
  inputFingerprint: string
  count: number | null
  positionsM?: string[]
  lengthComponents: { label: string; lengthM: string }[]
  quantities: Record<QuantityBasis, RebarBasisResult>
  rule?: RebarRuleRef
  derivation?: RebarDerivation[]
  sourceRefs: RebarSourceRef[]
  missingInputs: string[]
  status: 'calculated' | 'partial' | 'blocked'
  includedInTotals: boolean
  reviewState: 'unreviewed'
  fabricationApproved: false
}
export interface RebarResult {
  schemaVersion: 1
  engineVersion: string
  inputFingerprint: string
  status: 'complete' | 'partial' | 'blocked'
  rows: RebarRowResult[]
  totalsByBasis: Record<QuantityBasis, { knownLengthM: string; knownMassKg: string; lengthRows: number; massRows: number; incompleteRows: number }>
  coverage: { declared: boolean; expected: number; calculated: number; partial: number; blocked: number; excluded: number; missingGroupIds: string[]; unexpectedGroupIds: string[]; complete: boolean }
  issues: RebarIssue[]
  reviewState: 'unreviewed'
  fabricationApproved: false
}

export interface PingfaBarToken { kind: 'bars'; count: number; diameterMm: string; symbol: string; role?: 'side-construction' | 'side-torsion' }
export interface PingfaStirrupToken { kind: 'stirrups'; diameterMm: string; symbol: string; spacingMm: string[]; limbs?: number }
export interface PingfaBeamToken { kind: 'beam'; mark: string; beamType: string; spans?: number; cantilever?: 'A' | 'B'; widthMm: string; heightMm: string }
export type PingfaToken = PingfaBarToken | PingfaStirrupToken | PingfaBeamToken
export interface PingfaParseResult { text: string; supported: boolean; tokens: PingfaToken[]; unsupported: string[]; sourceRefs: RebarSourceRef[]; issues: RebarIssue[] }

export interface PingfaParameter { value: string | number | null; unit: LengthUnit | 'count' | 'kg/m'; sourceRefs: RebarSourceRef[] }
export interface PingfaLengthExpression { terms: { parameter: string; multiplier?: string }[] }
export interface PingfaRule {
  id: string
  role: string
  requiredParameters: string[]
  lengths: Partial<Record<QuantityBasis, PingfaLengthExpression>>
  countParameter?: string
  unitMassParameter?: string
}
export interface PingfaRuleSet {
  id: string
  version: string
  standardRefs: string[]
  errataFingerprint?: string
  reviewStatus: 'draft' | 'reviewed'
  adopted: boolean
  sourceRefs: RebarSourceRef[]
  supportedHostTypes: ('beam' | 'column' | 'slab' | 'foundation')[]
  requiredRoles: string[]
  rules: PingfaRule[]
}
export interface PingfaAnnotation { role: string; text: string; sourceRefs: RebarSourceRef[] }
export interface ExpandPingfaInput {
  hostId: string
  hostType: 'beam' | 'column' | 'slab' | 'foundation'
  scopeId: string
  central: PingfaAnnotation[]
  /** Local overrides apply only to this exact declared scope, never globally. */
  local?: (PingfaAnnotation & { scopeId: string })[]
  parameters: Record<string, PingfaParameter>
  /** Project drawing legend mapping; no A/B/C glyph-to-grade defaults. */
  steelGradeBySymbol?: Record<string, { grade: string; sourceRefs: RebarSourceRef[] }>
  /** Explicit theoretical unit mass for each diameter in this expansion. */
  unitMassByDiameter?: Record<string, PingfaParameter>
  ruleSet: PingfaRuleSet
}
export interface PingfaExpansion {
  rows: RebarRowInput[]
  coverage: NonNullable<RebarInput['coverage']>
  issues: RebarIssue[]
  ruleFingerprint: string
  appliedAnnotations: { role: string; origin: 'central' | 'local'; text: string; sourceRefs: RebarSourceRef[] }[]
  fabricationApproved: false
}
