export type CadPoint = { x: number; y: number; z: number }
/** Column-major 4x4 matrix; points are column vectors. Drawing units, no implicit metre conversion. */
export type CadMatrix = number[]
export type CadPair = { code: number; value: unknown }
export type CadIssue = { code: string; message: string; recordId?: string }
export type CadRecord = {
  id: string; type: string; handle?: string; owner?: string; section: string; block?: string
  space: 'model' | 'paper' | 'block'; layout: string; layer: string; auxiliary: boolean
  pairs: CadPair[]; nativeDecoded: boolean
  text?: string; dimension?: { type: number; override?: string; storedMeasurement?: number; style?: string }
  points: { code: number; coordinateSystem: 'OCS' | 'WCS' | 'entity-specific'; value: CadPoint }[]
  geometry: Record<string, unknown>
}
export type CadInstance = {
  id: string; recordId: string; handle?: string; type: string; layer: string; layout: string; space: 'model' | 'paper'
  /** Unique INSERT IDs and MINSERT row/column cells, followed by this source record ID. */
  path: string[]; parentTransform: CadMatrix; geometryTransform: CadMatrix
  /** Defined only for INSERT: maps referenced block coordinates to this layout's coordinates. */
  blockTransform?: CadMatrix
}
export type CadIndex = {
  format: 'dxf'; sourceHash: string; parser: { name: string; version: string; unknownEntities: number; unknownObjects: number }
  units: { insunits: number; name: string; metresPerUnit?: number; measurement?: number; verified: false }
  layers: { name: string; handle?: string; flags: number; off: boolean; frozen: boolean; color?: number }[]
  layouts: { name: string; blockRecordHandle?: string; space: 'model' | 'paper' }[]
  blocks: { name: string; handle?: string; base: CadPoint; flags: number; xrefPath?: string; entityCount: number }[]
  records: CadRecord[]; instances: CadInstance[]; issues: CadIssue[]
  inventory: {
    records: number; auxiliaryRecords: number; definitions: number; modelRecords: number; paperRecords: number
    byType: Record<string, number>; byLayer: Record<string, number>; byLayout: Record<string, number>
    placedInstances: number; modelInstances: number; paperInstances: number; expansionComplete: boolean
    unknownRecords: number; unresolvedXrefs: number; structuralReadComplete: boolean; professionalCoverage: 'not_assessed'
  }
}
/** Adapter uses the already bundled MLightCAD runtime, rather than a second DXF implementation. */
export type CadLibrary = {
  AcDbDxfFiler: { fromBuffer(data: Uint8Array, options?: unknown): any }
  AcDbDatabase: new () => any
  AcDbDxfDocumentReader: new (db: any) => { read(filer: any): Promise<{ unknownEntityCount: number; unknownObjectCount: number }> }
  acdbHostApplicationServices: () => { workingDatabase: any }
}
export type CadQuery = {
  collection?: 'records' | 'instances'; types?: string[]; layers?: string[]; layout?: string
  text?: string; handle?: string; recordId?: string; offset?: number; limit?: number; includeRaw?: boolean
}
