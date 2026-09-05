import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CASE_KINDS = new Set(['ordinary', 'large-tender', 'attachment-tool'])
const SESSION_ARTIFACT = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/
const ATTACHMENT_ID = /^sha256:([a-f0-9]{64})$/

export function resolveInside(root, value, label = 'path') {
  const base = resolve(root)
  const target = resolve(base, value)
  const rel = relative(base, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`${label} must resolve below its root`)
  }
  return target
}

export function anonymousId(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !ArrayBuffer.isView(value)
}

export function collectAttachmentRefs(value) {
  const refs = new Map()
  const seen = new Set()
  const visit = (candidate) => {
    if (!plainObject(candidate) || seen.has(candidate)) return
    seen.add(candidate)
    if (!Array.isArray(candidate)) {
      const match = ATTACHMENT_ID.exec(String(candidate.attachmentId ?? ''))
      if (match) {
        const name = typeof candidate.name === 'string' ? basename(candidate.name) : undefined
        const kind = typeof candidate.mediaType === 'string' ? 'image' : 'file'
        const bytes = Number.isSafeInteger(candidate.bytes) && candidate.bytes >= 0
          ? candidate.bytes
          : undefined
        const key = `${kind}\0${match[1]}\0${name ?? ''}`
        refs.set(key, { digest: match[1], kind, ...(name ? { name } : {}), ...(bytes === undefined ? {} : { bytes }) })
      }
    }
    for (const child of Array.isArray(candidate) ? candidate : Object.values(candidate)) visit(child)
  }
  visit(value)
  return [...refs.values()]
}

export function attachmentRelativePaths(ref) {
  const prefix = ref.digest.slice(0, 2)
  if (ref.kind === 'file') {
    return [
      join('file-objects', prefix, ref.digest),
      join('files', prefix, ref.digest, ref.name),
    ]
  }
  return [join('objects', prefix, ref.digest)]
}

export async function copySessionArtifacts(sourceFile, sourceSessions, targetSessions) {
  const sourceDir = dirname(sourceFile)
  const relDir = relative(sourceSessions, sourceDir)
  const targetDir = resolveInside(targetSessions, relDir, 'session directory')
  await mkdir(targetDir, { recursive: true })
  const names = (await readdir(sourceDir)).filter(name => SESSION_ARTIFACT.test(name)).sort()
  if (!names.includes(basename(sourceFile))) throw new Error('selected session artifact is not a supported JSONL file')
  const artifacts = []
  for (const name of names) {
    const source = join(sourceDir, name)
    const target = join(targetDir, name)
    const info = await stat(source)
    const before = await sha256(source)
    await copyFile(source, target)
    const copied = await sha256(target)
    if (copied !== before) throw new Error(`session copy hash mismatch: ${name}`)
    artifacts.push({ name, source, target, before, bytes: info.size })
  }
  return { targetDir, artifacts }
}

async function sourceArtifactsUnchanged(artifacts) {
  for (const artifact of artifacts) {
    const after = await sha256(artifact.source)
    if (after !== artifact.before) throw new Error(`source session changed during audit: ${artifact.name}`)
  }
}

async function loadDshRuntime(repoRoot) {
  const packageRoot = join(repoRoot, 'vendor', 'deepseek-harness', 'packages', 'session', 'session-persistence-jsonl')
  const jsonlEntry = join(packageRoot, 'lib', 'index.js')
  const cordisEntry = join(repoRoot, 'vendor', 'deepseek-harness', 'vendor', 'cordis', 'lib', 'index.js')
  if (!existsSync(jsonlEntry) || !existsSync(cordisEntry)) {
    throw new Error('built DSH session-persistence-jsonl and cordis libraries are required')
  }
  const [{ default: JsonlSessionPersistence }, { Context }] = await Promise.all([
    import(pathToFileURL(jsonlEntry).href),
    import(pathToFileURL(cordisEntry).href),
  ])
  return { JsonlSessionPersistence, Context }
}

async function openRead(runtime, root, compression, expectedId) {
  const ctx = new runtime.Context()
  const fiber = await ctx.plugin(runtime.JsonlSessionPersistence, { root, compression })
  try {
    const listed = await ctx.sessionPersistence.list()
    const snapshot = expectedId
      ? listed.find(item => String(item.header.id) === expectedId)
      : listed[0]
    if (!snapshot || listed.length !== 1) {
      throw new Error(`isolated case must contain exactly one session; found ${listed.length}`)
    }
    const handle = await ctx.sessionPersistence.open(snapshot.header.id, 'read')
    try {
      return {
        header: handle.header,
        inheritedEventCount: Number(handle.inheritedEventCount),
        events: await handle.read(),
      }
    } finally {
      await handle.close()
    }
  } finally {
    await fiber.dispose()
  }
}

function eventTypeCounts(events) {
  const counts = {}
  for (const event of events) counts[event.type] = (counts[event.type] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

async function verifyAndCopyAttachments(refs, sourceHome, targetHome) {
  const sourceRoot = join(sourceHome, 'attachments', 'v1')
  const targetRoot = join(targetHome, 'attachments', 'v1')
  const results = []
  for (const ref of refs) {
    const paths = attachmentRelativePaths(ref)
    let verified = 0
    for (const rel of paths) {
      const source = resolveInside(sourceRoot, rel, 'attachment source')
      if (!existsSync(source)) continue
      const info = await stat(source)
      const actual = await sha256(source)
      const valid = actual === ref.digest && (ref.bytes === undefined || info.size === ref.bytes)
      if (valid) {
        const target = resolveInside(targetRoot, rel, 'attachment target')
        await mkdir(dirname(target), { recursive: true })
        await copyFile(source, target)
        if (await sha256(target) !== actual) throw new Error('attachment copy hash mismatch')
        verified += 1
      }
    }
    results.push({
      id: ref.digest.slice(0, 12),
      kind: ref.kind,
      ...(ref.bytes === undefined ? {} : { bytes: ref.bytes }),
      validCopies: verified,
      valid: verified > 0,
    })
  }
  return results
}

function redactError(error, sourceHome, scratchRoot) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: message
      .replaceAll(resolve(sourceHome), '<SOURCE_DSH_HOME>')
      .replaceAll(resolve(scratchRoot), '<SCRATCH>'),
  }
}

export async function auditCase({ kind, relativeSession, sourceHome, runRoot, repoRoot, runtime }) {
  const caseId = anonymousId(relativeSession)
  const sourceSessions = join(sourceHome, 'sessions')
  const sourceFile = resolveInside(sourceSessions, relativeSession, 'session artifact')
  const targetHome = join(runRoot, `${kind}-${caseId}`, 'dsh-home')
  const targetSessions = join(targetHome, 'sessions')
  const staged = await copySessionArtifacts(sourceFile, sourceSessions, targetSessions)
  const compression = sourceFile.endsWith('.zstd') ? 'zstd' : 'none'
  try {
    const first = await openRead(runtime, targetSessions, compression)
    const eventCounts = eventTypeCounts(first.events)
    const refs = collectAttachmentRefs(first.events)
    const attachmentChecks = await verifyAndCopyAttachments(refs, sourceHome, targetHome)
    if (attachmentChecks.some(item => !item.valid)) {
      throw new Error('one or more referenced attachments are missing or fail content verification')
    }
    const second = await openRead(runtime, targetSessions, compression, String(first.header.id))
    const migratedArtifacts = (await readdir(staged.targetDir)).filter(name => SESSION_ARTIFACT.test(name)).sort()
    const currentName = `session.v${first.header.version}.jsonl${compression === 'zstd' ? '.zstd' : ''}`
    if (Number(first.header.version) !== 2 || !migratedArtifacts.includes(currentName)) {
      throw new Error(`migration did not publish a v2 successor; header=${String(first.header.version)}`)
    }
    if (second.events.length !== first.events.length) throw new Error('migrated v2 event count changed on reopen')
    if (JSON.stringify(eventTypeCounts(second.events)) !== JSON.stringify(eventCounts)) {
      throw new Error('migrated v2 event types changed on reopen')
    }
    for (const artifact of staged.artifacts) {
      if (await sha256(artifact.target) !== artifact.before) {
        throw new Error(`historical copy changed during migration: ${artifact.name}`)
      }
    }
    await sourceArtifactsUnchanged(staged.artifacts)
    return {
      kind,
      caseId,
      ok: true,
      sourceArtifacts: staged.artifacts.map(item => ({
        name: item.name,
        sha256Prefix: item.before.slice(0, 12),
        bytes: item.bytes,
        sourceHashUnchanged: true,
        historicalCopyHashUnchanged: true,
      })),
      migratedArtifacts,
      version: Number(first.header.version),
      events: first.events.length,
      inheritedEventCount: first.inheritedEventCount,
      eventTypes: eventCounts,
      attachments: {
        references: refs.length,
        valid: attachmentChecks.filter(item => item.valid).length,
        invalid: attachmentChecks.filter(item => !item.valid).length,
        items: attachmentChecks,
      },
    }
  } catch (error) {
    await sourceArtifactsUnchanged(staged.artifacts)
    return { kind, caseId, ok: false, error: redactError(error, sourceHome, runRoot) }
  }
}

function parseArgs(argv) {
  const parsed = { cases: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]
    if (arg === '--source-home' || arg === '--scratch-root' || arg === '--repo-root') {
      if (!value) throw new Error(`${arg} requires a value`)
      parsed[arg.slice(2).replace('-', '')] = value
      index += 1
    } else if (arg === '--case') {
      if (!value?.includes('=')) throw new Error('--case requires kind=relative-session-path')
      const split = value.indexOf('=')
      const kind = value.slice(0, split)
      if (!CASE_KINDS.has(kind)) throw new Error(`unsupported case kind: ${kind}`)
      parsed.cases.push({ kind, relativeSession: value.slice(split + 1) })
      index += 1
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return parsed
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = resolve(args.reporoot ?? join(import.meta.dirname, '..'))
  const sourceHome = resolve(args.sourcehome ?? '')
  const scratchRoot = resolve(args.scratchroot ?? join(repoRoot, '.codex-temp', 'session-013-migration'))
  if (!args.sourcehome || args.cases.length === 0 || new Set(args.cases.map(item => item.kind)).size !== args.cases.length) {
    throw new Error('provide --source-home and at least one unique --case')
  }
  if (!existsSync(join(sourceHome, 'sessions'))) throw new Error('source DSH_HOME has no sessions directory')
  const scratchRelative = relative(sourceHome, scratchRoot)
  if (scratchRelative === '' || (!scratchRelative.startsWith('..') && !isAbsolute(scratchRelative))) {
    throw new Error('scratch directory must not be inside the source DSH_HOME')
  }
  const runRoot = join(scratchRoot, `run-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`)
  await mkdir(runRoot, { recursive: true })
  const runtime = await loadDshRuntime(repoRoot)
  const results = []
  for (const selected of args.cases) {
    results.push(await auditCase({ ...selected, sourceHome, runRoot, repoRoot, runtime }))
  }
  const report = {
    schema: 1,
    dshSessionFormat: 2,
    sourceHomeId: anonymousId(sourceHome),
    runId: basename(runRoot),
    credentialsCopied: false,
    cases: results,
  }
  await writeFile(join(runRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (results.some(item => !item.ok)) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
