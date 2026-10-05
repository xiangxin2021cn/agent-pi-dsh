import type { EngineeringProvider, EngineeringProviderMetadata } from './types.ts'

/** Runtime capabilities only; this registry never owns or deletes project records. */
export class EngineeringProviderRegistry {
  readonly apiVersion = 1
  private providers = new Map<string, EngineeringProvider>()

  register(provider: EngineeringProvider): () => void {
    if (!provider || !/^[a-z][a-z0-9.-]{1,79}$/.test(provider.id) || !provider.version?.trim() || !provider.title?.trim() || typeof provider.parse !== 'function' || typeof provider.audit !== 'function' || !Array.isArray(provider.dependencies) || !Array.isArray(provider.limitations) || provider.limitations.some(value => typeof value !== 'string')) throw new Error('Invalid engineering provider')
    if (provider.execute !== undefined && typeof provider.execute !== 'function') throw new Error('Invalid engineering provider executor')
    if (provider.inputDescription !== undefined && (typeof provider.inputDescription !== 'string' || !provider.inputDescription.trim())) throw new Error('Invalid engineering provider input description')
    if (this.providers.has(provider.id)) throw new Error(`Engineering provider already registered: ${provider.id}`)
    const ids = new Set<string>()
    for (const dependency of provider.dependencies) {
      if (!dependency?.id?.trim() || dependency.id === provider.id || ids.has(dependency.id) || dependency.version !== undefined && !dependency.version.trim()) throw new Error('Invalid engineering provider dependency')
      ids.add(dependency.id)
    }
    const stored: EngineeringProvider = { ...structuredClone({ id: provider.id, version: provider.version, title: provider.title, dependencies: provider.dependencies, limitations: provider.limitations, ...(provider.inputDescription ? { inputDescription: provider.inputDescription } : {}) }), parse: provider.parse, audit: provider.audit, ...(provider.execute ? { execute: provider.execute } : {}) }
    this.providers.set(stored.id, stored)
    const visit = (id: string, stack: Set<string>) => {
      if (stack.has(id)) throw new Error('Circular engineering provider dependency')
      const row = this.providers.get(id)
      if (row) for (const dep of row.dependencies) visit(dep.id, new Set(stack).add(id))
    }
    try { visit(stored.id, new Set()) } catch (error) { this.providers.delete(stored.id); throw error }
    return () => { if (this.providers.get(stored.id) === stored) this.providers.delete(stored.id) }
  }

  list(): EngineeringProviderMetadata[] {
    return [...this.providers.values()].map(({ parse: _parse, audit: _audit, execute: _execute, ...metadata }) => structuredClone(metadata))
  }

  assess(id: string): { status: 'available' | 'unavailable'; reasons: string[] } {
    const reasons: string[] = [], visited = new Set<string>()
    const visit = (currentId: string) => {
      if (visited.has(currentId)) return
      visited.add(currentId)
      const row = this.providers.get(currentId)
      if (!row) { reasons.push(`Missing engineering provider: ${currentId}`); return }
      for (const dep of row.dependencies) {
        const loaded = this.providers.get(dep.id)
        if (loaded && dep.version && loaded.version !== dep.version) reasons.push(`Engineering provider ${dep.id} requires ${dep.version}; loaded ${loaded.version}`)
        visit(dep.id)
      }
    }
    visit(id)
    return { status: reasons.length ? 'unavailable' : 'available', reasons }
  }

  get(id: string): EngineeringProvider {
    const state = this.assess(id)
    if (state.status !== 'available') throw new Error(state.reasons.join('; '))
    const row = this.providers.get(id)!
    return { ...this.list().find(value => value.id === id)!, parse: row.parse, audit: row.audit, ...(row.execute ? { execute: row.execute } : {}) }
  }
}
