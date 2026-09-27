export interface BoqResource {
  id: string; title: string; unit: string; rateUnit: string
  consumption: number; rate: number; evidenceIds: string[]
  status: 'sourced' | 'scenario' | 'unverified'
  conversion?: { factor: number; basis: string }
}
export interface BoqCalculationItem {
  id: string; code: string; quantity: number; unit: string
  kind: 'physical' | 'provisional' | 'percentage' | 'rate_only' | 'daywork' | 'lump_sum'
  scope: string; method: string; measurement: string; evidenceIds: string[]
  resources: BoqResource[]
  transferAmount?: number; percentage?: number; percentageBase?: number
}
const finite = (value: number, name: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number`)
  return value
}
const round = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Calculation overflow')
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6
}

/** Internal direct cost and physical consumption; commercial additions stay explicit. */
export function calculateBoq(items: BoqCalculationItem[]) {
  const ids = new Set<string>()
  const resources = new Map<string, { id: string; title: string; unit: string; total: number; cost: number; evidenceIds: string[] }>()
  const rows = items.map(item => {
    if (!item.id || ids.has(item.id)) throw new Error('Duplicate or missing BOQ item id')
    ids.add(item.id)
    finite(item.quantity, 'BOQ quantity')
    if (!item.code || !item.unit || !item.scope || !item.measurement || !item.evidenceIds.length) throw new Error('BOQ identity, scope and measurement evidence are required')
    if (!['physical', 'provisional', 'percentage', 'rate_only', 'daywork', 'lump_sum'].includes(item.kind)) throw new Error('Unknown BOQ pricing kind')
    if (['provisional', 'percentage'].includes(item.kind)) {
      if (item.resources.length) throw new Error('A commercial transfer item cannot silently create physical resources')
      const amount = item.kind === 'provisional' ? finite(item.transferAmount!, 'Provisional amount')
        : finite(item.percentageBase!, 'Percentage base') * finite(item.percentage!, 'Percentage') / 100
      return { id: item.id, code: item.code, kind: item.kind, directUnitCost: null, directCost: 0, commercialAmount: round(amount), resourceRows: [], needsReview: false }
    }
    if (!item.method || !item.resources.length) throw new Error('Physical build-up needs a method and resource consumption')
    const localIds = new Set<string>()
    let needsReview = false
    const resourceRows = item.resources.map(resource => {
      if (!resource.id || localIds.has(resource.id)) throw new Error('Duplicate resource in one BOQ build-up')
      localIds.add(resource.id)
      finite(resource.consumption, 'Unit resource consumption'); finite(resource.rate, 'Resource rate')
      if (!resource.unit || !resource.rateUnit || !resource.title || !['sourced', 'scenario', 'unverified'].includes(resource.status)) throw new Error('Invalid resource basis')
      if (resource.status === 'sourced' && !resource.evidenceIds.length) throw new Error('Sourced resource needs evidence')
      needsReview ||= resource.status !== 'sourced'
      let conversion = 1
      if (resource.unit !== resource.rateUnit) {
        if (!resource.conversion?.basis || !finite(resource.conversion.factor, 'Unit conversion')) throw new Error('Incompatible resource units need an explicit conversion basis')
        conversion = resource.conversion.factor
      }
      const unitCost = resource.consumption * conversion * resource.rate
      const quantity = item.kind === 'rate_only' ? 0 : item.quantity
      const total = resource.consumption * quantity
      const cost = unitCost * quantity
      if (quantity > 0) {
        const key = `${resource.id}\0${resource.unit}`
        const sum = resources.get(key) || { id: resource.id, title: resource.title, unit: resource.unit, total: 0, cost: 0, evidenceIds: [] }
        sum.total += total; sum.cost += cost; sum.evidenceIds = [...new Set([...sum.evidenceIds, ...resource.evidenceIds])]
        resources.set(key, sum)
      }
      return { ...resource, unitCost: round(unitCost), total: round(total), cost: round(cost) }
    })
    const unitCost = resourceRows.reduce((sum, row) => sum + row.unitCost, 0)
    return { id: item.id, code: item.code, kind: item.kind, directUnitCost: round(unitCost), directCost: item.kind === 'rate_only' ? 0 : round(unitCost * item.quantity), commercialAmount: 0, resourceRows, needsReview }
  })
  return { rows, resources: [...resources.values()].map(row => ({ ...row, total: round(row.total), cost: round(row.cost) })),
    directCost: round(rows.reduce((sum, row) => sum + row.directCost, 0)), commercialTransfers: round(rows.reduce((sum, row) => sum + row.commercialAmount, 0)),
    unverifiedItems: rows.filter(row => row.needsReview).map(row => row.id) }
}

export function deriveCrewConsumption(input: { quantity: number; dailyOutput: number; workingHours: number; crew: Array<{ id: string; count: number }> }) {
  finite(input.quantity, 'Quantity')
  if (!finite(input.dailyOutput, 'Daily output') || !finite(input.workingHours, 'Working hours')) throw new Error('Output and working hours must be positive')
  const days = input.quantity / input.dailyOutput
  return { workingDays: round(days), resources: input.crew.map(row => ({ id: row.id, perUnitHours: round(finite(row.count, 'Crew count') * input.workingHours / input.dailyOutput), totalHours: round(row.count * input.workingHours * days) })) }
}

/** Peak configuration requires an explicit time allocation, separate from consumption. */
export function resourcePeaks(allocations: Array<{ id: string; start: string; end: string; resources: Array<{ id: string; count: number }> }>) {
  const points = new Map<number, Map<string, number>>()
  const add = (at: number, id: string, count: number) => { const changes = points.get(at) || new Map(); changes.set(id, (changes.get(id) || 0) + count); points.set(at, changes) }
  const ids = new Set<string>()
  for (const allocation of allocations) {
    const start = Date.parse(allocation.start), end = Date.parse(allocation.end)
    if (!allocation.id || ids.has(allocation.id) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Allocation requires unique id and a positive time interval')
    ids.add(allocation.id)
    for (const resource of allocation.resources) { finite(resource.count, 'Resource count'); add(start, resource.id, resource.count); add(end, resource.id, -resource.count) }
  }
  const active = new Map<string, number>(), peaks = new Map<string, { id: string; count: number; at: string }>()
  for (const [at, changes] of [...points].sort((a, b) => a[0] - b[0])) for (const [id, change] of changes) {
    const count = (active.get(id) || 0) + change; active.set(id, count)
    if (count > (peaks.get(id)?.count || 0)) peaks.set(id, { id, count, at: new Date(at).toISOString() })
  }
  return [...peaks.values()]
}
