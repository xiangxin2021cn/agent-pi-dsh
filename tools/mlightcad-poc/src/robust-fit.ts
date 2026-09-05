export interface CadPoint2d {
  x: number
  y: number
}

export interface CadBounds2d {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CadEntityExtent {
  id?: string
  type?: string
  min: CadPoint2d
  max: CadPoint2d
}

export interface RobustFitResult {
  bounds: CadBounds2d
  coverage: number
  excludedCount: number
  fullBounds: CadBounds2d
  includedCount: number
  source: 'database' | 'full'
  spanReduction: number
}

const MAX_EXCLUDED_FRACTION = 0.01
const MAX_EXCLUDED_SIZE_FRACTION = 0.1
const MINIMUM_ENTITY_COUNT = 50
const MINIMUM_SPAN_REDUCTION = 1.5

/**
 * Validates the drawing's stored database extents as an optional "main content"
 * viewport. It never removes geometry; callers must expose this only as an
 * explicit view action while keeping ordinary Zoom Extents available.
 */
export function chooseRobustFitBounds(
  input: readonly CadEntityExtent[],
  databaseBounds?: CadBounds2d
): RobustFitResult | undefined {
  const entities = input.filter(isFiniteExtent)
  if (entities.length === 0) return undefined

  const fullBounds = unionBounds(entities)
  const fullResult = createFullResult(fullBounds, entities.length)
  if (entities.length < MINIMUM_ENTITY_COUNT || !databaseBounds) {
    return fullResult
  }

  const candidate = normalizeBounds(databaseBounds)
  if (!candidate) return fullResult

  const included = entities.filter((extent) => contains(candidate, extent))
  const excluded = entities.filter((extent) => !contains(candidate, extent))
  if (excluded.length === 0) return fullResult

  const coverage = included.length / entities.length
  const candidateDiagonal = diagonal(candidate)
  const fullDiagonal = diagonal(fullBounds)
  const spanReduction = fullDiagonal / candidateDiagonal
  const largestExcluded = excluded.reduce(
    (largest, extent) => Math.max(largest, extentDiagonal(extent)),
    0
  )

  if (1 - coverage > MAX_EXCLUDED_FRACTION + Number.EPSILON) {
    return fullResult
  }
  if (spanReduction < MINIMUM_SPAN_REDUCTION) return fullResult
  if (largestExcluded / candidateDiagonal > MAX_EXCLUDED_SIZE_FRACTION) {
    return fullResult
  }

  return {
    bounds: candidate,
    coverage,
    excludedCount: excluded.length,
    fullBounds,
    includedCount: included.length,
    source: 'database',
    spanReduction
  }
}

function contains(bounds: CadBounds2d, extent: CadEntityExtent): boolean {
  return extent.min.x >= bounds.minX &&
    extent.max.x <= bounds.maxX &&
    extent.min.y >= bounds.minY &&
    extent.max.y <= bounds.maxY
}

function diagonal(bounds: CadBounds2d): number {
  return Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
}

function extentDiagonal(extent: CadEntityExtent): number {
  return Math.hypot(extent.max.x - extent.min.x, extent.max.y - extent.min.y)
}

function isFiniteExtent(extent: CadEntityExtent): boolean {
  return [extent.min.x, extent.min.y, extent.max.x, extent.max.y].every(Number.isFinite) &&
    extent.min.x <= extent.max.x &&
    extent.min.y <= extent.max.y
}

function normalizeBounds(bounds: CadBounds2d): CadBounds2d | undefined {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
    return undefined
  }
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return undefined
  return { ...bounds }
}

function unionBounds(entities: readonly CadEntityExtent[]): CadBounds2d {
  return entities.reduce<CadBounds2d>(
    (bounds, extent) => ({
      minX: Math.min(bounds.minX, extent.min.x),
      minY: Math.min(bounds.minY, extent.min.y),
      maxX: Math.max(bounds.maxX, extent.max.x),
      maxY: Math.max(bounds.maxY, extent.max.y)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  )
}

function createFullResult(
  bounds: CadBounds2d,
  entityCount: number
): RobustFitResult {
  return {
    bounds,
    coverage: 1,
    excludedCount: 0,
    fullBounds: bounds,
    includedCount: entityCount,
    source: 'full',
    spanReduction: 1
  }
}
