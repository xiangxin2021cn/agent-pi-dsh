import type { EngineeringSourceRef, EngineeringSource, EngineeringDependency, EngineeringIssue } from '../engineering-core/index.ts'
export type CivilUnit = 'm' | 'mm'
export type CivilKind = 'pipe' | 'drain' | 'road_layer' | 'rectangular' | 'count'
export type CivilQuantityBasis = 'plan_2d' | 'spatial_3d' | 'plan_area_thickness' | 'rectangular_solid' | 'count' | 'unknown'
export interface CivilBase { id: string; physicalId: string; title: string; sources: EngineeringSourceRef[] }
export type CivilObject =
  | (CivilBase & { kind: 'pipe' | 'drain'; dimension: '2d' | '3d'; pathKind: 'polyline' | 'curved' | 'unknown'; unit: CivilUnit; points: Array<number[] | null> })
  | (CivilBase & { kind: 'road_layer'; unit: CivilUnit; outline: number[][] | null; holes: 'none' | 'present' | 'unknown'; surface: 'planar' | 'curved' | 'unknown'; thickness: { value: number | null; unit: CivilUnit } })
  | (CivilBase & { kind: 'rectangular'; unit: CivilUnit; length: number | null; width: number | null; height: number | null; voids: 'none' | 'present' | 'unknown' })
  | (CivilBase & { kind: 'count'; count: number | null })
export interface CivilExpected {
  physicalId: string; kind: CivilKind; title: string; sources: EngineeringSourceRef[]
  disposition: 'include' | 'exclude'; reason?: string
}
export interface CivilCalculationInput {
  catalog: { id: string; title: string; sources: EngineeringSourceRef[]; items: CivilExpected[] }
  objects: CivilObject[]
}
export interface CivilEvidence { sources: EngineeringSource[]; dependencies: readonly EngineeringDependency[] }
export interface CivilRow {
  physicalId: string; kind: CivilKind; title: string; objectIds: string[]; sources: EngineeringSourceRef[]
  status: 'calculated' | 'partial' | 'missing' | 'blocked' | 'excluded' | 'unlisted'
  quantity: number | null; knownPortion: number | null; unit: 'm' | 'm2' | 'm3' | 'item'; quantityBasis: CivilQuantityBasis
  purpose: 'geometric'; reviewStatus: 'needs_review'; algorithmVersion: 'civil-geometry-v1'; formula: string
  measures: Record<string, unknown>; issues: EngineeringIssue[]
}
export interface CivilCalculationResult {
  schemaVersion: 1; action: 'calculate'; algorithmVersion: 'civil-geometry-v1'; reviewStatus: 'needs_review'
  catalogId: string; rows: CivilRow[]; issues: EngineeringIssue[]
  totals: Array<{ kind: CivilKind; unit: CivilRow['unit']; quantityBasis: CivilQuantityBasis; completeSubtotal: number | null; knownPartialSubtotal: number | null; knownSubtotal: number | null; incomplete: boolean }>
  coverage: { declared: number; included: number; excluded: number; calculated: number; partial: number; incomplete: number; unlisted: number; completeWithinDeclaredCatalog: boolean }
}
export interface PdfCalibrationInput {
  source: EngineeringSourceRef; page: number; viewport: { id: string; width: number; height: number }; coordinateSpace: 'normalized' | 'pixels'
  reference: { source: EngineeringSourceRef; page: number; viewportId: string; start: [number, number]; end: [number, number]; realLength: number | null; unit: CivilUnit; label: string }
}
