import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST = '.agent-pi-links.json'

function walkLinks(root, out = []) {
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.name === '.git' || entry.name === 'website' || entry.name === 'docs') continue
      try {
        if (entry.isSymbolicLink()) {
          out.push({
            from: relative(root, full).split(sep).join('/'),
            to: relativizeLink(full, readlinkSync(full)),
          })
          continue
        }
      } catch {
        continue
      }
      if (entry.isDirectory()) stack.push(full)
    }
  }
  return out
}

function relativizeLink(fromPath, link) {
  const normalized = String(link).split(sep).join('/')
  if (!/^[A-Za-z]:/.test(link) && !link.startsWith('\\\\')) return normalized
  return relative(dirname(fromPath), resolve(link)).split(sep).join('/')
}

function linkTarget(dest) {
  try {
    if (!lstatSync(dest).isSymbolicLink()) return ''
    return resolve(dirname(dest), readlinkSync(dest))
  } catch {
    return ''
  }
}

export function writeManifest(dshRoot, destRoot = dshRoot) {
  const links = walkLinks(dshRoot)
  mkdirSync(destRoot, { recursive: true })
  writeFileSync(join(destRoot, MANIFEST), `${JSON.stringify({ version: 1, links }, null, 2)}\n`)
  return links.length
}

function isReparsePoint(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

export function stripReparsePoints(root) {
  let removed = 0
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        try {
          rmSync(full, { force: true })
          removed += 1
        } catch {
          // keep walking
        }
        continue
      }
      if (entry.isDirectory()) stack.push(full)
    }
  }
  return removed
}

export function stripLinks(root) {
  const manifestPath = join(root, MANIFEST)
  let removed = 0
  if (existsSync(manifestPath)) {
    const { links } = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const { from } of links ?? []) {
      const dest = join(root, from)
      if (!isReparsePoint(dest)) continue
      try {
        rmSync(dest, { force: true })
        removed += 1
      } catch {
        // walk below will retry
      }
    }
  }
  removed += stripReparsePoints(root)
  return { removed }
}

// Antivirus scanners hold transient handles on freshly copied trees; a
// symlink() then fails EBUSY/EPERM even though nothing owns the path. Retry
// with a short synchronous backoff before giving up.
function makeLinkWithRetry(target, dest) {
  const kind = process.platform === 'win32' ? 'junction' : 'dir'
  for (let attempt = 1; ; attempt += 1) {
    try {
      symlinkSync(target, dest, kind)
      return
    } catch (error) {
      const transient = error && (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EEXIST')
      if (!transient || attempt >= 10) throw error
      try {
        const stat = lstatSync(dest)
        rmSync(dest, { recursive: !stat.isSymbolicLink(), force: true })
      } catch {
        // dest may not exist; the lock can sit on the parent directory
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * attempt)
    }
  }
}

export function repairLinks(dshRoot) {
  const manifestPath = join(dshRoot, MANIFEST)
  if (!existsSync(manifestPath)) {
    throw new Error(`missing ${manifestPath}; run write-dsh-link-manifest first`)
  }
  const { links } = JSON.parse(readFileSync(manifestPath, 'utf8'))
  let repaired = 0
  let skipped = 0
  for (const { from, to } of links ?? []) {
    const dest = join(dshRoot, from)
    const target = resolve(dirname(dest), to)
    if (!existsSync(target)) {
      skipped += 1
      continue
    }
    if (linkTarget(dest) === target) {
      skipped += 1
      continue
    }
    mkdirSync(dirname(dest), { recursive: true })
    if (existsSync(dest) || linkTarget(dest)) {
      try {
        const stat = lstatSync(dest)
        rmSync(dest, { recursive: !stat.isSymbolicLink(), force: true })
      } catch {
        // replace below
      }
    }
    makeLinkWithRetry(target, dest)
    repaired += 1
  }
  return { repaired, skipped, total: links.length }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const mode = process.argv[2]
  const root = process.argv[3]
  if (!root) {
    process.stderr.write('usage: repair-dsh-links.mjs write|repair|strip <root> [destRoot]\n')
    process.exit(2)
  }
  if (mode === 'write') {
    const dest = process.argv[4] || root
    const n = writeManifest(root, dest)
    process.stdout.write(`wrote ${n} links -> ${join(dest, MANIFEST)}\n`)
  } else if (mode === 'repair') {
    const result = repairLinks(root)
    process.stdout.write(`repaired ${result.repaired}/${result.total} (skipped ${result.skipped})\n`)
  } else if (mode === 'strip') {
    const result = stripLinks(root)
    process.stdout.write(`stripped ${result.removed} reparse points under ${root}\n`)
  } else {
    process.stderr.write(`unknown mode ${mode}\n`)
    process.exit(2)
  }
}
