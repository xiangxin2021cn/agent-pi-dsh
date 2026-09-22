/** Adapt only removed settings fields before DSH's own one-time importer runs. */
export function migrateSettings017(document) {
  const legacy = document.get('agent-presets', true)
  if (legacy?.get) {
    const selected = legacy.get('default')
    const enabled = legacy.get('modeSelectionEnabled')
    if (!document.has('agent-preset-registry')) document.set('agent-preset-registry', document.createNode({}))
    const registry = document.get('agent-preset-registry', true)
    if (typeof selected === 'string' && !registry.has('selectedDefault')) {
      registry.set('selectedDefault', selected === 'code' ? 'standard' : selected)
    }
    if (typeof enabled === 'boolean' && !registry.has('modeSelectionEnabled')) registry.set('modeSelectionEnabled', enabled)
    document.delete('agent-presets')
  }
  // The official DeepSeek adapter now speaks Messages only; other providers are untouched.
  const deepseek = document.get('llm-deepseek', true)
  if (deepseek?.delete) deepseek.delete('protocol')
  const office = document.get('univer-office', true)
  if (office?.get) {
    if (!document.has('univer')) document.set('univer', document.createNode({}))
    const target = document.get('univer', true)
    const value = office.get('autoOpenLivePreview')
    if (typeof value === 'boolean' && !target.has('autoOpenLivePreview')) target.set('autoOpenLivePreview', value)
    document.delete('univer-office')
  }
  return document
}
