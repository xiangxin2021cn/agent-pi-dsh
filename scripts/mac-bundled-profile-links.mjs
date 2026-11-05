import { lstatSync, readFileSync, readlinkSync, realpathSync, unlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

function contains(root, path) {
  const child = relative(root, path)
  return !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`)
}

function relativeTarget(parent, link, root) {
  if (typeof link !== 'string' || !link || isAbsolute(link) || /^[A-Za-z]:|^[\\/]|\0/.test(link)) {
    throw new Error(`Invalid relative macOS DSH runtime link: ${link}`)
  }
  const parts = link.replaceAll('\\', '/').split('/').filter(part => part && part !== '.')
  const firstChild = parts.findIndex(part => part !== '..')
  if (firstChild !== -1 && parts.slice(firstChild).includes('..')) {
    throw new Error(`Non-canonical macOS DSH runtime link: ${link}`)
  }
  const target = resolve(parent, link)
  if (!contains(root, target)) throw new Error(`macOS DSH runtime link escapes its root: ${link}`)
  return target
}

function verifyInsideDsh(root, requested) {
  let parts = relative(root, requested).split(sep).filter(Boolean)
  let current = root
  let hops = 0
  while (parts.length) {
    const next = join(current, parts.shift())
    const stat = lstatSync(next, { throwIfNoEntry: false })
    if (!stat) throw new Error(`Dangling macOS DSH runtime link: ${requested}`)
    if (!stat.isSymbolicLink()) {
      current = next
      continue
    }
    if (++hops > 40) throw new Error(`Cyclic macOS DSH runtime link: ${requested}`)
    const target = relativeTarget(current, readlinkSync(next), root)
    parts = [...relative(root, target).split(sep).filter(Boolean), ...parts]
    current = root
  }
  return current
}

/** Relative POSIX links are already present. Remove the startup repair trigger before signing. */
export function sealMacDshLinks(dshRoot) {
  const root = realpathSync(dshRoot)
  const manifestPath = join(root, '.agent-pi-links.json')
  const stat = lstatSync(manifestPath, { throwIfNoEntry: false })
  if (!stat) return
  if (!stat.isFile()) throw new Error('Invalid macOS DSH runtime link manifest')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest?.version !== 1 || !Array.isArray(manifest.links)) throw new Error('Invalid macOS DSH runtime link manifest')
  const seen = new Set()
  for (const { from, to } of manifest.links) {
    if (typeof from !== 'string' || /[:\\\0]/.test(from)
      || from.split('/').some(part => part === '' || part === '.' || part === '..')
      || !from.split('/').includes('node_modules')) throw new Error(`Invalid macOS DSH runtime link path: ${from}`)
    const dest = resolve(root, from)
    const parent = dirname(dest)
    if (seen.has(dest) || verifyInsideDsh(root, parent) !== parent
      || !lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Missing or invalid listed macOS DSH runtime link: ${from}`)
    }
    seen.add(dest)
    const expected = relativeTarget(parent, to, root)
    const actual = relativeTarget(parent, readlinkSync(dest), root)
    if (actual !== expected) throw new Error(`macOS DSH runtime link target differs from the manifest: ${from}`)
    verifyInsideDsh(root, expected)
  }
  unlinkSync(manifestPath)
}

function physicalPath(path) {
  if (lstatSync(path, { throwIfNoEntry: false })) return realpathSync(path)
  const parent = dirname(path)
  if (parent === path) throw new Error(`Cannot resolve the macOS profile path: ${path}`)
  return join(physicalPath(parent), basename(path))
}

/** Resolve each link from its real parent and keep the signed app read-only. */
export function macBundledProfileLinks({ productRoot, dshRoot, home, stage }) {
  const lexicalRoots = [resolve(productRoot), resolve(dshRoot)]
  const roots = lexicalRoots.map(path => realpathSync(path))
  const runtime = dirname(roots[0])
  if (roots[0] !== join(runtime, 'product') || roots[1] !== join(runtime, 'deepseek-harness')) {
    throw new Error('Expected sibling product and DeepSeek Harness roots in the macOS runtime')
  }
  const homeRoot = stage ? null : physicalPath(resolve(home))
  const inBundle = path => roots.some(root => contains(root, path))
  if (homeRoot && (contains(runtime, homeRoot) || contains(homeRoot, runtime))) {
    throw new Error('The macOS profile must be separate from the bundled runtime')
  }

  function destination(path) {
    const lexical = resolve(path)
    const physical = join(physicalPath(dirname(lexical)), basename(lexical))
    const bundled = inBundle(physical)
    const lexicalOwner = lexicalRoots.findIndex(root => contains(root, lexical))
    if ((lexicalOwner !== -1 && !contains(roots[lexicalOwner], physical))
      || (!bundled && (!homeRoot || !contains(homeRoot, physical)))) {
      throw new Error(`macOS profile destination escaped the bundled runtime and writable profile: ${path}`)
    }
    return { path: physical, bundled }
  }

  function plan(source, dest) {
    const checked = destination(dest)
    const target = realpathSync(source)
    if (!inBundle(target) && (!homeRoot || !contains(homeRoot, target))) {
      throw new Error(`macOS profile link target escaped the bundled runtime and writable profile: ${source}`)
    }
    if (checked.bundled && !stage) {
      if (!lstatSync(checked.path, { throwIfNoEntry: false })?.isSymbolicLink()
        || isAbsolute(readlinkSync(checked.path)) || realpathSync(checked.path) !== target) {
        throw new Error(`Missing or invalid sealed macOS runtime peer: ${dest}`)
      }
      return null
    }
    return { destination: checked.path, target: relative(dirname(checked.path), target) }
  }

  return { destination, plan }
}
