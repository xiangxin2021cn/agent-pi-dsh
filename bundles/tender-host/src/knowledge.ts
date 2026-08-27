import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { knowledgeRoot } from './fsutil.ts'
import { repoRoot } from './root.ts'

export interface KnowledgeProfile {
  id: string
  label: string
  labelZh: string
  pricingStandard: string
  currencyHint?: string
  knowledgePack: string
  bindings: unknown
}

export interface KnowledgeRegistry {
  schemaVersion: 1
  defaultProfileId: string
  profiles: Record<string, KnowledgeProfile>
}

export function loadKnowledgeRegistry(): KnowledgeRegistry {
  const path = join(knowledgeRoot(), 'profiles.json')
  return JSON.parse(readFileSync(path, 'utf8')) as KnowledgeRegistry
}

export function resolveBindingPath(relativePath: string): string {
  const root = repoRoot()
  return resolve(root, relativePath.replace(/^knowledge\//, 'knowledge/'))
}

/** One resolved knowledge binding: a method standard, exemplar, or style template on disk. */
export interface BindingFile {
  area: 'analysis' | 'pricing' | 'planning'
  key: string
  role: string
  title?: string
  path: string
  exists: boolean
  /** Present when the binding is a knowledge-base slug instead of a factory file. */
  slug?: string
}

/**
 * Flatten a profile's bindings into absolute file references for stage drafts and briefs.
 * Missing files are kept with exists=false so callers can decide whether to surface them.
 */
export function resolveBindingFiles(profileId?: string): { profileId: string; files: BindingFile[] } {
  const registry = loadKnowledgeRegistry()
  const id = profileId ?? registry.defaultProfileId
  const profile = registry.profiles[id]
  if (!profile) throw new Error(`Unknown knowledge profile ${id}`)
  const bindings = (profile.bindings ?? {}) as Record<string, unknown>
  const files: BindingFile[] = []
  for (const area of ['analysis', 'pricing', 'planning'] as const) {
    const group = bindings[area]
    if (!group || typeof group !== 'object') continue
    for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const item = value as { path?: unknown; role?: unknown; title?: unknown }
      if (typeof item.path !== 'string' || !item.path) continue
      const abs = resolveBindingPath(item.path)
      files.push({
        area,
        key,
        role: typeof item.role === 'string' ? item.role : 'reference',
        title: typeof item.title === 'string' ? item.title : undefined,
        path: abs,
        exists: existsSync(abs),
      })
    }
  }
  return { profileId: id, files }
}

export function knowledgeStatus(profileId?: string) {
  const registry = loadKnowledgeRegistry()
  const id = profileId ?? registry.defaultProfileId
  const profile = registry.profiles[id]
  if (!profile) throw new Error(`Unknown knowledge profile ${id}`)
  const packDir = resolve(repoRoot(), profile.knowledgePack.replace(/^knowledge\//, 'knowledge/'))
  return {
    profileId: id,
    label: profile.label,
    labelZh: profile.labelZh,
    pricingStandard: profile.pricingStandard,
    currencyHint: profile.currencyHint,
    packExists: existsSync(packDir),
    packDir,
    bindings: profile.bindings,
    available: Object.keys(registry.profiles),
  }
}
