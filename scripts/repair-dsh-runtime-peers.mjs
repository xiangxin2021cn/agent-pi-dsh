import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

function resolvedPackage(consumer, name) {
  const require = createRequire(join(consumer, 'package.json'))
  const path = require.resolve.paths(name)?.map(base => join(base, name))
    .find(path => existsSync(join(path, 'package.json')))
  return path && realpathSync(path)
}

// A workspace peer duplicated as a devDependency loses its consumer link under
// pnpm --prod. Project only peers from the CLI runtime closure, using the lock's
// existing workspace targets; never install packages or rewrite upstream files.
export function repairDshRuntimePeers(dshRoot, lock) {
  const root = realpathSync(dshRoot)
  lock ??= createRequire(join(root, 'apps/cli/package.json'))('js-yaml')
    .load(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'))
  const visited = new Set(), peers = [], providers = new Map()
  function workspaceTarget(directory, name, required) {
    const importer = lock.importers[directory]
    const entry = importer.dependencies?.[name] ?? importer.optionalDependencies?.[name] ?? importer.devDependencies?.[name]
    if (!entry?.version?.startsWith('link:')) {
      if (required) throw new Error(`Workspace peer has no locked link: ${directory} -> ${name}`)
      return
    }
    const target = realpathSync(resolve(root, directory, entry.version.slice(5)))
    const child = relative(root, target)
    if (isAbsolute(child) || child === '..' || child.startsWith('..' + sep)) throw new Error(`Locked workspace target outside DSH runtime: ${name}`)
    const key = child.split(sep).join('/') || '.'
    if (!lock.importers[key] || JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name !== name) {
      throw new Error(`Locked workspace target does not match package: ${name}`)
    }
    return { target, key }
  }
  function visit(directory) {
    if (visited.has(directory)) return
    visited.add(directory)
    const consumer = join(root, directory)
    const manifest = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8'))
    const workspacePeers = Object.fromEntries(Object.entries(manifest.peerDependencies ?? {}).filter(([, range]) => range.startsWith('workspace:')))
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...workspacePeers })) {
      const peer = name in workspacePeers
      const locked = workspaceTarget(directory, name, peer)
      if (!locked) continue
      if (peer) {
        const current = resolvedPackage(consumer, name)
        if (current && current !== locked.target) throw new Error(`Runtime consumer resolves a different locked peer: ${directory} -> ${name}`)
        peers.push({ consumer, name, target: locked.target })
        if (!current) {
          if (providers.has(name) && providers.get(name) !== locked.target) throw new Error(`Conflicting locked workspace peer: ${name}`)
          providers.set(name, locked.target)
        }
      }
      visit(locked.key)
    }
  }
  visit('apps/cli')
  const links = []
  for (const [name, target] of providers) {
    const link = join(root, 'node_modules', name)
    const existing = lstatSync(link, { throwIfNoEntry: false })
    if (existing) {
      if (realpathSync(link) !== target) throw new Error(`Existing runtime peer link conflicts with lock: ${name}`)
      continue
    }
    links.push({ name, link, target, version: JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).version })
  }
  for (const { link, target } of links) {
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(process.platform === 'win32' ? target : relative(dirname(link), target), link, process.platform === 'win32' ? 'junction' : 'dir')
  }
  for (const { consumer, name, target } of peers) {
    if (resolvedPackage(consumer, name) !== target) throw new Error(`Runtime workspace peer remains unresolved: ${name}`)
  }
  return { packages: visited.size, peers: peers.length, links: links.length,
    restoredLinks: links.map(({ name, link, target, version }) => ({ name, version,
      link: relative(root, link).split(sep).join('/'), target: relative(root, target).split(sep).join('/') })) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const reportIndex = process.argv.indexOf('--report')
  if (!process.argv[2] || (reportIndex !== -1 && !process.argv[reportIndex + 1])) throw new Error('Usage: node repair-dsh-runtime-peers.mjs <dsh-root> [--report <json-file>]')
  const result = repairDshRuntimePeers(resolve(process.argv[2]))
  if (reportIndex !== -1) {
    const report = resolve(process.argv[reportIndex + 1])
    mkdirSync(dirname(report), { recursive: true })
    writeFileSync(report, JSON.stringify(result, null, 2) + '\n')
  }
  const { restoredLinks, ...summary } = result
  console.log(JSON.stringify(summary))
}
