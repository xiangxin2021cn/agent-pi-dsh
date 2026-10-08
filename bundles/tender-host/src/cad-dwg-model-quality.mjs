const referenceName = value => typeof value === 'string' && value.length > 0 ? value.toUpperCase() : undefined

export function inspectDwgModel(model) {
  const layers = model.tables.LAYER.entries
  const blocks = model.tables.BLOCK_RECORD.entries
  const layerNames = new Set(layers.map(layer => referenceName(layer.name)).filter(Boolean))
  const blockNames = new Set(blocks.map(block => referenceName(block.name)).filter(Boolean))
  const seen = new Set()
  const layerSamples = []
  const blockSamples = []
  const counts = { layers: layers.length, blocks: blocks.length, entities: 0, inserts: 0 }
  const entityTypes = {}
  const issues = { total: 0, unresolvedLayers: 0, unresolvedBlocks: 0, samples: [] }
  let embeddedObjectCount = 0

  const inspect = entity => {
    if (seen.has(entity)) return
    seen.add(entity)
    counts.entities++
    entityTypes[entity.type] = (entityTypes[entity.type] || 0) + 1
    if (entity.type === 'OLE2FRAME' || entity.type === 'OLEFRAME') embeddedObjectCount++
    const sample = (code, reference) => ({
      code,
      handle: typeof entity.handle === 'string' ? entity.handle : null,
      type: entity.type,
      reference: typeof reference === 'string' || typeof reference === 'number' ? reference : null,
    })
    if (!layerNames.has(referenceName(entity.layer))) {
      issues.unresolvedLayers++
      if (layerSamples.length < 10) layerSamples.push(sample('unresolved-layer', entity.layer))
    }
    if (entity.type === 'INSERT' || entity.type === 'MINSERT') {
      counts.inserts++
      if (!blockNames.has(referenceName(entity.name))) {
        issues.unresolvedBlocks++
        if (blockSamples.length < 10) blockSamples.push(sample('unresolved-block', entity.name))
      }
      for (const attribute of entity.attribs ?? []) inspect(attribute)
    }
  }

  for (const entity of model.entities) inspect(entity)
  for (const block of blocks) for (const entity of block.entities) inspect(entity)
  issues.total = issues.unresolvedLayers + issues.unresolvedBlocks
  issues.samples = [...layerSamples, ...blockSamples]
  return { schema: 'cad-dwg-model-quality/v1', valid: issues.total === 0, counts, entityTypes, embeddedObjectCount, issues }
}
