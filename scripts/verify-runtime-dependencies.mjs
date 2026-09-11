import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, sep } from 'node:path'
import { TEAM_PACKAGES } from './agent-teams-profile.mjs'

// Adapt the official Desktop dependency-graph check to our existing HTTP shell
// and pnpm workspace layout. Inspect manifests rather than require.resolve(name):
// ESM-only packages may legitimately have no require export.
export function verifyDependencyClosure(roots, runtimeRoots = roots) {
  const boundaries = runtimeRoots.map(path => realpathSync(path))
  const visited = new Set()
  const failures = []
  function visit(directory, chain) {
    const canonical = realpathSync(directory)
    if (!boundaries.some(root => {
      const child = relative(root, canonical)
      return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep))
    })) throw new Error(`Runtime dependency resolves outside the packaged runtime: ${chain} -> ${canonical}`)
    if (visited.has(canonical)) return
    visited.add(canonical)
    const manifest = JSON.parse(readFileSync(join(canonical, 'package.json'), 'utf8'))
    const require = createRequire(join(canonical, 'package.json'))
    const optional = manifest.optionalDependencies ?? {}
    for (const name of Object.keys({ ...manifest.dependencies, ...optional })) {
      const path = (require.resolve.paths(name) ?? []).map(base => join(base, name))
        .find(candidate => existsSync(join(candidate, 'package.json')))
      if (!path) {
        if (!(name in optional)) failures.push(`${chain} -> ${name}`)
        continue
      }
      visit(path, `${chain} -> ${name}`)
    }
  }
  for (const root of roots) visit(root, root)
  if (failures.length) throw new Error('运行时依赖不完整 / runtime dependencies missing:\n' + failures.join('\n'))
  return { packages: visited.size }
}

export function verifyProductDependencyClosure(dsh, product) {
  const roots = [join(dsh, 'apps/cli'), ...TEAM_PACKAGES.map(name => join(dsh, 'packages/experimental', name))]
  if (product) roots.push(...['bundles/tender-host', 'packages/business-core', 'vendor/dsh-univer-office'].map(path => join(product, path)))
  return verifyDependencyClosure(roots, [dsh, ...(product ? [product] : [])])
}
