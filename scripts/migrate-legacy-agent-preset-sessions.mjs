import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readSync, readdirSync,
  renameSync, rmSync, statSync, writeFileSync, writeSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const MIGRATION_VERSION = 1
const LEGACY_PRESET = 'code'
const REPLACEMENT_PRESET = 'standard'
const HEADER_LIMIT = 1024 * 1024
const COPY_BUFFER_SIZE = 1024 * 1024
const CHECKSUM_OPTIONS = { params: { [constants.ZSTD_c_checksumFlag]: 1 } }

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function ensurePrivateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
}

function writeJsonAtomic(path, value) {
  ensurePrivateDirectory(dirname(path))
  const temp = `${path}.agent-pi-writing`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  const swap = `${path}.agent-pi-old`
  if (existsSync(swap)) rmSync(swap, { force: true })
  if (existsSync(path)) renameSync(path, swap)
  try {
    renameSync(temp, path)
    if (existsSync(swap)) rmSync(swap, { force: true })
  } catch (error) {
    if (!existsSync(path) && existsSync(swap)) renameSync(swap, path)
    throw error
  }
}

function firstZstdFrameEnd(buffer) {
  let offset = 0
  if (buffer.length < 4) return undefined
  if (buffer.readUInt32LE(0) !== 0xFD2FB528) throw new Error('invalid Zstandard frame magic')
  offset += 4
  if (offset === buffer.length) return undefined
  const descriptor = buffer.readUInt8(offset++)
  if ((descriptor & 0x18) !== 0) throw new Error('reserved Zstandard frame-header bit')
  const contentSizeFlag = descriptor >>> 6
  const singleSegment = (descriptor & 0x20) !== 0
  const checksum = (descriptor & 0x04) !== 0
  const dictionaryFlag = descriptor & 0x03
  const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
  const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
  const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
  if (buffer.length - offset < remainingHeaderBytes) return undefined
  offset += remainingHeaderBytes
  for (;;) {
    if (buffer.length - offset < 3) return undefined
    const blockHeader = buffer.readUIntLE(offset, 3)
    offset += 3
    const lastBlock = (blockHeader & 1) !== 0
    const blockType = (blockHeader >>> 1) & 0x03
    const blockSize = blockHeader >>> 3
    if (blockType === 0x03) throw new Error('reserved Zstandard block type')
    const payloadBytes = blockType === 0x01 ? 1 : blockSize
    if (buffer.length - offset < payloadBytes) return undefined
    offset += payloadBytes
    if (lastBlock) break
  }
  if (checksum) {
    if (buffer.length - offset < 4) return undefined
    offset += 4
  }
  return offset
}

function readPrefixUntil(path, boundary) {
  const handle = openSync(path, 'r')
  const chunks = []
  let total = 0
  try {
    while (total < HEADER_LIMIT) {
      const chunk = Buffer.alloc(Math.min(8192, HEADER_LIMIT - total))
      const bytesRead = readSync(handle, chunk, 0, chunk.length, total)
      if (bytesRead === 0) break
      chunks.push(chunk.subarray(0, bytesRead))
      total += bytesRead
      const buffer = Buffer.concat(chunks)
      const end = boundary(buffer)
      if (end !== undefined) return { prefix: buffer.subarray(0, end), end }
    }
  } finally {
    closeSync(handle)
  }
  throw new Error(`session header exceeds ${HEADER_LIMIT} bytes or is incomplete`)
}

function readHeader(path) {
  if (path.endsWith('.jsonl.zstd')) {
    const { prefix, end } = readPrefixUntil(path, firstZstdFrameEnd)
    const plaintext = zstdDecompressSync(prefix).toString('utf8')
    if (!plaintext.endsWith('\n') || plaintext.indexOf('\n') !== plaintext.length - 1) {
      throw new Error('compressed session header frame must contain exactly one JSONL line')
    }
    return { header: JSON.parse(plaintext.slice(0, -1)), originalPrefix: prefix, prefixEnd: end, encoding: 'zstd' }
  }
  const result = readPrefixUntil(path, buffer => {
    const newline = buffer.indexOf(0x0A)
    return newline === -1 ? undefined : newline + 1
  })
  return {
    header: JSON.parse(result.prefix.subarray(0, -1).toString('utf8')),
    originalPrefix: result.prefix,
    prefixEnd: result.end,
    encoding: 'none',
  }
}

function encodeHeader(header, encoding) {
  const plaintext = `${JSON.stringify(header)}\n`
  return encoding === 'zstd'
    ? zstdCompressSync(plaintext, CHECKSUM_OPTIONS)
    : Buffer.from(plaintext)
}

function recoverInterruptedRewrite(path) {
  const temp = `${path}.agent-pi-preset-migrating`
  const swap = `${path}.agent-pi-preset-old`
  if (!existsSync(path) && existsSync(swap)) renameSync(swap, path)
  if (existsSync(path) && existsSync(swap)) rmSync(swap, { force: true })
  if (existsSync(temp)) rmSync(temp, { force: true })
}

function replacePrefix(path, originalPrefixEnd, replacementPrefix) {
  recoverInterruptedRewrite(path)
  const source = openSync(path, 'r')
  const mode = statSync(path).mode & 0o777
  const temp = `${path}.agent-pi-preset-migrating`
  const target = openSync(temp, 'wx', mode || 0o600)
  try {
    writeSync(target, replacementPrefix)
    const buffer = Buffer.alloc(COPY_BUFFER_SIZE)
    let position = originalPrefixEnd
    for (;;) {
      const bytesRead = readSync(source, buffer, 0, buffer.length, position)
      if (bytesRead === 0) break
      writeSync(target, buffer, 0, bytesRead)
      position += bytesRead
    }
    fsyncSync(target)
  } finally {
    closeSync(source)
    closeSync(target)
  }
  const swap = `${path}.agent-pi-preset-old`
  renameSync(path, swap)
  try {
    renameSync(temp, path)
    rmSync(swap, { force: true })
  } catch (error) {
    if (!existsSync(path) && existsSync(swap)) renameSync(swap, path)
    throw error
  }
}

function sessionLogs(root) {
  if (!existsSync(root)) return []
  const files = []
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && (entry.name === 'session.jsonl' || entry.name === 'session.jsonl.zstd')) files.push(path)
    }
  }
  return files
}

function invalidateProjectionCache(home, sessionIds, backupRoot) {
  const path = join(home, 'storages', 'session_projcache.json')
  if (!existsSync(path) || sessionIds.size === 0) return 0
  const document = JSON.parse(readFileSync(path, 'utf8'))
  const sessions = document?.tables?.sessions
  if (typeof sessions !== 'object' || sessions === null || Array.isArray(sessions)) return 0
  const removed = {}
  for (const id of sessionIds) {
    if (!Object.hasOwn(sessions, id)) continue
    removed[id] = sessions[id]
    delete sessions[id]
  }
  const count = Object.keys(removed).length
  if (count === 0) return 0
  writeJsonAtomic(join(backupRoot, 'projection-cache-removed.json'), {
    version: MIGRATION_VERSION,
    removed,
  })
  writeJsonAtomic(path, document)
  return count
}

export function migrateLegacyAgentPresetSessions(home, options = {}) {
  const resolvedHome = resolve(home)
  const backupRoot = join(resolvedHome, '.runtime-install', 'agent-pi-preset-session-migration-v1')
  const marker = join(backupRoot, 'complete.json')
  if (!options.force && existsSync(marker)) {
    return { scanned: 0, migrated: 0, invalidated: 0, errors: 0, skipped: true }
  }
  ensurePrivateDirectory(backupRoot)
  let scanned = 0
  let errors = 0
  const migratedIds = new Set()
  for (const path of sessionLogs(join(resolvedHome, 'sessions'))) {
    scanned += 1
    try {
      recoverInterruptedRewrite(path)
      const current = readHeader(path)
      if (current.header?.type !== 'session' || current.header.agentPreset !== LEGACY_PRESET) continue
      const sessionId = current.header.id
      if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('legacy session header has no id')
      const migrated = { ...current.header, agentPreset: REPLACEMENT_PRESET }
      const replacementPrefix = encodeHeader(migrated, current.encoding)
      const backupName = `${sha256(sessionId)}.json`
      const backupPath = join(backupRoot, backupName)
      if (!existsSync(backupPath)) {
        writeJsonAtomic(backupPath, {
          version: MIGRATION_VERSION,
          sessionId,
          relativePath: relative(resolvedHome, path),
          encoding: current.encoding,
          originalPrefixBase64: current.originalPrefix.toString('base64'),
          originalPrefixSha256: sha256(current.originalPrefix),
          replacementPrefixSha256: sha256(replacementPrefix),
        })
      }
      replacePrefix(path, current.prefixEnd, replacementPrefix)
      migratedIds.add(sessionId)
    } catch {
      errors += 1
    }
  }
  const invalidated = invalidateProjectionCache(resolvedHome, migratedIds, backupRoot)
  const summary = {
    version: MIGRATION_VERSION,
    legacyPreset: LEGACY_PRESET,
    replacementPreset: REPLACEMENT_PRESET,
    scanned,
    migrated: migratedIds.size,
    invalidated,
    errors,
  }
  if (errors === 0) writeJsonAtomic(marker, summary)
  else writeJsonAtomic(join(backupRoot, 'incomplete.json'), summary)
  return { scanned, migrated: migratedIds.size, invalidated, errors, skipped: false }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const home = process.argv[2] || process.env.DSH_HOME
  if (!home) throw new Error('usage: node migrate-legacy-agent-preset-sessions.mjs <DSH_HOME>')
  const result = migrateLegacyAgentPresetSessions(home)
  process.stdout.write(`legacy Agent preset session migration: ${JSON.stringify(result)}\n`)
}
