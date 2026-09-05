import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const receiptSchema = 'agent-pi-dsh/univer-skills-receipt/v1'
const receiptRelativePath = join('.agent-pi-managed', 'dsh-univer-office-skills.json')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function regularFileHash(path) {
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) return null
    return sha256(readFileSync(path))
  } catch {
    return null
  }
}

function safeDirectory(path) {
  try {
    const stat = lstatSync(path)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

function validSkillName(name) {
  return typeof name === 'string'
    && /^[a-z0-9][a-z0-9._-]*$/i.test(name)
    && name !== '.'
    && name !== '..'
}

function receiptEntryName(entry) {
  if (typeof entry?.path !== 'string' || typeof entry?.sha256 !== 'string') return null
  const parts = entry.path.split('/')
  if (parts.length !== 3 || parts[0] !== 'skills' || parts[2] !== 'SKILL.md') return null
  if (!validSkillName(parts[1]) || !/^[a-f0-9]{64}$/.test(entry.sha256)) return null
  return parts[1]
}

function readReceipt(path) {
  if (!existsSync(path)) return { entries: new Map(), writable: true }
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) return { entries: new Map(), writable: false }
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (value?.schema !== receiptSchema || !Array.isArray(value.files)) {
      return { entries: new Map(), writable: true }
    }
    const entries = new Map()
    for (const entry of value.files) {
      const name = receiptEntryName(entry)
      if (!name || entries.has(name)) return { entries: new Map(), writable: true }
      entries.set(name, { path: entry.path, sha256: entry.sha256 })
    }
    return { entries, writable: true }
  } catch {
    return { entries: new Map(), writable: true }
  }
}

function writeReceipt(path, pluginVersion, entries) {
  if (entries.length === 0) {
    rmSync(path, { force: true })
    try {
      rmdirSync(dirname(path))
    } catch {
      // Keep a non-empty product metadata directory.
    }
    return
  }
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.new`
  const value = {
    schema: receiptSchema,
    plugin: { name: 'dsh-univer-office', version: pluginVersion ?? null },
    files: entries.sort((left, right) => left.path.localeCompare(right.path)),
  }
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  rmSync(path, { force: true })
  renameSync(temp, path)
}

function sourceSkills(pluginRoot) {
  const root = join(resolve(pluginRoot), 'skills')
  if (!safeDirectory(root)) return new Map()
  const result = new Map()
  for (const name of readdirSync(root).sort()) {
    if (!validSkillName(name)) continue
    const directory = join(root, name)
    const source = join(directory, 'SKILL.md')
    if (!safeDirectory(directory)) continue
    const hash = regularFileHash(source)
    if (!hash) continue
    result.set(name, { source, hash })
  }
  return result
}

function pluginVersion(pluginRoot) {
  try {
    const manifest = JSON.parse(readFileSync(join(resolve(pluginRoot), 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : null
  } catch {
    return null
  }
}

function destinationState(home, name, { create = false } = {}) {
  const skillsRoot = join(resolve(home), 'skills')
  if (existsSync(skillsRoot)) {
    if (!safeDirectory(skillsRoot)) return { safe: false }
  } else if (create) {
    mkdirSync(skillsRoot, { recursive: true })
  } else {
    return { safe: true, path: join(skillsRoot, name, 'SKILL.md'), missingParent: true }
  }

  const skillDir = join(skillsRoot, name)
  if (existsSync(skillDir)) {
    if (!safeDirectory(skillDir)) return { safe: false }
  } else if (create) {
    mkdirSync(skillDir)
  }
  return { safe: true, path: join(skillDir, 'SKILL.md'), skillDir }
}

function removeEmptySkillDirectory(path) {
  try {
    rmdirSync(path)
  } catch {
    // A non-empty skill directory may contain user files and must be retained.
  }
}

export function managedUniverSkillsReceiptPath(home) {
  return join(resolve(home), receiptRelativePath)
}

/**
 * Mirror only product-owned Univer skills. The receipt is the ownership proof:
 * unreceipted or user-modified files are never overwritten or removed.
 */
export function syncManagedUniverSkills({ home, pluginRoot, active }) {
  const receiptPath = managedUniverSkillsReceiptPath(home)
  const receipt = readReceipt(receiptPath)
  const result = { active: Boolean(active), copied: 0, updated: 0, removed: 0, preserved: 0 }
  if (!receipt.writable) {
    result.preserved = receipt.entries.size
    return result
  }

  const sources = active ? sourceSkills(pluginRoot) : new Map()
  const nextEntries = []
  const names = new Set([...receipt.entries.keys(), ...sources.keys()])

  for (const name of [...names].sort()) {
    const previous = receipt.entries.get(name)
    const source = sources.get(name)
    let destination = destinationState(home, name)

    if (!source) {
      if (!previous) continue
      const currentHash = destination.safe ? regularFileHash(destination.path) : null
      if (currentHash && currentHash === previous.sha256) {
        rmSync(destination.path, { force: true })
        if (destination.skillDir) removeEmptySkillDirectory(destination.skillDir)
        result.removed += 1
      } else if (existsSync(destination.path ?? '')) {
        result.preserved += 1
      }
      continue
    }

    if (!destination.safe) {
      result.preserved += 1
      continue
    }
    const currentHash = regularFileHash(destination.path)
    if (!previous && currentHash) {
      result.preserved += 1
      continue
    }
    if (previous && currentHash && currentHash !== previous.sha256) {
      result.preserved += 1
      continue
    }
    if (existsSync(destination.path) && currentHash === null) {
      result.preserved += 1
      continue
    }

    destination = destinationState(home, name, { create: true })
    if (!destination.safe) {
      result.preserved += 1
      continue
    }
    if (!currentHash) result.copied += 1
    else if (currentHash !== source.hash) result.updated += 1
    copyFileSync(source.source, destination.path)
    nextEntries.push({ path: `skills/${name}/SKILL.md`, sha256: source.hash })
  }

  writeReceipt(receiptPath, active ? pluginVersion(pluginRoot) : null, nextEntries)
  return result
}
