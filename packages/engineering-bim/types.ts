export interface BimComponent {
  id: string
  type: 'IfcBeam' | 'IfcSlab' | 'IfcBuildingElementProxy'
  name: string
  /** Rectangular prism extents in metres along local X, Y, Z. */
  sizeMeters: [number, number, number]
  /** Minimum local corner in the project's engineering coordinate system, metres. */
  positionMeters: [number, number, number]
  rotationDegrees?: number
}
export type BimRequest =
  | { action: 'health' }
  | { action: 'generate'; outputPath: string; projectName: string; components: BimComponent[] }
  | { action: 'inventory' | 'query' | 'geometry' | 'preview'; sourcePath: string; expectedSha256: string; offset?: number; limit?: number; types?: string[]; globalIds?: string[]; maxTriangles?: number }
export interface BimIssue { code: string; severity: 'error' | 'warning'; message: string; globalId?: string }
export interface BimResult {
  schemaVersion: 1
  action: BimRequest['action']
  engine: { name: 'IfcOpenShell'; version: string; available: boolean; pythonExecutable?: string; pythonVersion?: string }
  algorithmVersion: string
  reviewStatus: 'needs_review'
  issues: BimIssue[]
  source?: { path: string; sha256: string; schema: string }
  [key: string]: unknown
}
export interface BimEngineOptions { pythonPath?: string; timeoutMs?: number; signal?: AbortSignal }
