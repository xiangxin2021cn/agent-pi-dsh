import type { Capability, TaskBrief } from './types.ts'

export class CapabilityRegistry {
  readonly apiVersion = 1
  private entries = new Map<string, Capability>()
  register(capability: Capability): () => void {
    if (!capability.id?.trim() || !capability.owner?.trim() || !capability.version || !capability.title || !capability.description) throw new Error('Invalid capability contribution')
    for (const key of ['professions', 'tools', 'skills', 'inputs', 'outputs', 'limitations', 'supplements'] as const) if (!Array.isArray(capability[key])) throw new Error(`Capability requires ${key}`)
    if (this.entries.has(capability.id)) throw new Error(`Capability already registered: ${capability.id}`)
    const stored = structuredClone(capability)
    this.entries.set(stored.id, stored)
    return () => { if (this.entries.get(stored.id) === stored) this.entries.delete(stored.id) }
  }
  list(): Capability[] { return structuredClone([...this.entries.values()]) }
}

export function assessCapability(capability: Capability, brief: TaskBrief, available: { tools: string[]; skills: string[]; enabledModules?: string[] }) {
  const missingTools = capability.tools.filter(name => !available.tools.includes(name))
  const missingSkills = capability.skills.filter(name => !available.skills.includes(name))
  const reasons: string[] = []
  let status: 'available' | 'conditional' | 'unavailable' | 'not_applicable' = 'available'
  if (missingTools.length || missingSkills.length || (capability.module && available.enabledModules && !available.enabledModules.includes(capability.module))) status = 'unavailable'
  if (missingTools.length) reasons.push(`Missing tools: ${missingTools.join(', ')}`)
  if (missingSkills.length) reasons.push(`Missing skills: ${missingSkills.join(', ')}`)
  if (capability.module && available.enabledModules && !available.enabledModules.includes(capability.module)) reasons.push('Module is disabled or unloaded')
  const countries = capability.applicability?.countries
  const countryKey = (value: string) => ({ '中国': 'CN', 'CHINA': 'CN', 'CHN': 'CN', '纳米比亚': 'NA', 'NAMIBIA': 'NA', 'NAM': 'NA', '南非': 'ZA', 'SOUTH AFRICA': 'ZA', 'ZAF': 'ZA' }[value.trim().toUpperCase()] || value.trim().toUpperCase())
  const country = countryKey(brief.basis.country)
  if (country && ((countries?.length && !countries.map(countryKey).includes(country)) || capability.applicability?.excludedCountries?.map(countryKey).includes(country))) { status = 'not_applicable'; reasons.push('Project jurisdiction is outside the declared scope') }
  else if (countries?.length && !country && status === 'available') { status = 'conditional'; reasons.push('Project jurisdiction needs evidence') }
  const standards = capability.applicability?.standards
  if (standards?.length && !standards.some(id => brief.basis.standards.some(row => row.id === id))) {
    if (status === 'available') status = 'conditional'
    reasons.push('Applicable standard and version need verification')
  }
  if (brief.profession !== 'general' && !capability.professions.includes('general') && !capability.professions.includes(brief.profession)) {
    status = 'not_applicable'; reasons.push('Capability does not cover this profession')
  }
  return { ...capability, status, reasons, missingTools, missingSkills }
}

export function toolCapabilities(tools: Array<{ name: string; description?: string }>): Capability[] {
  return tools.filter(tool => !tool.name.startsWith('professional_task')).map(tool => ({
    id: `tool:${tool.name}`, owner: 'dsh-native-tool-adapter', version: 'runtime', title: tool.name,
    description: tool.description || tool.name, professions: ['general'], tools: [tool.name], skills: [],
    inputs: ['Refer to the native tool schema'], outputs: ['Refer to the native tool schema'],
    limitations: ['Tool availability does not prove suitability or result accuracy'], supplements: ['Inspect schema and validate actual output'],
  }))
}
