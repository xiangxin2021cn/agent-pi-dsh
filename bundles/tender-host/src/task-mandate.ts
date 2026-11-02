import { createHash } from 'node:crypto'
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs'
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import type { ProfessionalTask } from '../../../packages/professional-tasks/types.ts'

export interface TaskMandateSnapshot {
  schemaVersion: 1
  rootSessionId: string
  taskSha256: string | null
  policySha256: string
  policyState: 'configured' | 'not_configured'
  knowledge: Array<{ slug: string; versionId: string | null; sourceSha256: string; metadataSha256: string }>
  templates: Array<{ slug: string; versionId: string; dnaId: string; profileSha256: string }>
  skills: Array<{ id: string; manifestSha256: string; sourcePath: string }>
  fingerprint: string
}
export interface TaskMandateInput {
  sessionId: string
  task?: ProfessionalTask
  knowledgeRoot?: string
  skillRoots?: string[]
  skillSlugs?: string[]
  /** Winning paths from the native scoped skill catalog; never renderer-supplied. */
  skillFiles?: Array<{ id: string; path: string; root: string }>
  /** Only the host's resolved sandbox/approval/tool policy, never provider configuration. */
  permissionPolicy?: unknown
}

const slugPattern = /^[a-z0-9][a-z0-9-]{0,127}$/
const skillPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/
const shaPattern = /^[a-f0-9]{64}$/
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const layers = { L1: 'L1-language.md', L2: 'L2-structure.md', L3: 'L3-scope.md', L4: 'L4-evidence.md', L5: 'L5-reasoning.md', L6: 'L6-format.md', summary: 'Writing-DNA.md' }

function stable(value: any): string {
  return JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
    ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])) : row)
}
const hash = (value: unknown) => digest(stable(value))
function assertIdentifier(value: unknown, pattern = slugPattern): asserts value is string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('接力快照的来源或版本标识无效。')
}

/** Reads only explicit host-owned roots. No home scan, parsing, writes or model calls. */
export function captureTaskMandate(input: TaskMandateInput): TaskMandateSnapshot {
  if (!input.sessionId?.trim() || input.sessionId.length > 240 || input.task && input.task.sessionId !== input.sessionId) throw new Error('接力快照与原主会话不一致。')
  let remaining = 256 * 1024 * 1024
  function ownedPath(root: string, path: string) {
    if (!isAbsolute(root) || !isAbsolute(path)) throw new Error('接力来源必须使用宿主的绝对路径。')
    const child = relative(resolve(root), resolve(path))
    if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) throw new Error('接力来源不属于登记目录。')
    let current = parse(resolve(path)).root
    for (const part of relative(current, resolve(path)).split(sep)) {
      current = join(current, part)
      try { if (lstatSync(current).isSymbolicLink()) throw new Error('接力来源不能经过符号链接或目录联接。') }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolve(path); throw error }
    }
    return resolve(path)
  }
  function bytes(root: string, path: string, limit: number, optional = false): Buffer | undefined {
    const owned = ownedPath(root, path)
    let fd: number
    try { fd = openSync(owned, 'r') }
    catch (error) { if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    try {
      const before = fstatSync(fd)
      if (!before.isFile() || before.size > limit || before.size > remaining) throw new Error('接力来源不是受限大小的普通文件，请先缩小选用范围。')
      const chunks: Buffer[] = [], buffer = Buffer.alloc(Math.min(1024 * 1024, limit + 1))
      let size = 0
      for (;;) {
        const count = readSync(fd, buffer, 0, Math.min(buffer.length, limit - size + 1), null)
        if (!count) break
        size += count
        if (size > limit || size > remaining) throw new Error('接力来源超过读取限额。')
        chunks.push(Buffer.from(buffer.subarray(0, count)))
      }
      const after = fstatSync(fd)
      if (before.size !== size || after.size !== size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('接力来源在读取时发生变化，请重新核对。')
      remaining -= size
      return Buffer.concat(chunks, size)
    } finally { closeSync(fd) }
  }
  function json(root: string, path: string, optional = false): any {
    const content = bytes(root, path, 8 * 1024 * 1024, optional)
    return content === undefined ? undefined : JSON.parse(content.toString('utf8'))
  }
  function fileHash(root: string, path: string, limit = 32 * 1024 * 1024) { return digest(bytes(root, path, limit)!) }
  function metadata(entry: any) {
    return { sourceKind: entry.sourceKind || 'original', regions: [...new Set((entry.regions || []).map((row: string) => String(row).trim()).filter(Boolean))], supersedes: [...new Set(entry.supersedes || [])], derivedFrom: [...new Set(entry.derivedFrom || [])], ...(entry.validFrom ? { validFrom: entry.validFrom } : {}), ...(entry.validUntil ? { validUntil: entry.validUntil } : {}) }
  }
  const versions = new Map<string, { manuscriptHash: string; originalHash: string | undefined; metadataSha256: string }>()
  function version(root: string, slug: string, versionId: string) {
    assertIdentifier(versionId, shaPattern)
    const key = `${slug}@${versionId}`, prior = versions.get(key)
    if (prior) return prior
    const dir = join(root, 'versions', slug, versionId), row = json(root, join(dir, 'version.json'))
    if (row?.schemaVersion !== 1 || row.versionId !== versionId || row.entry?.slug !== slug || !Array.isArray(row.manifest?.chunks)) throw new Error('接力所需知识固定版本无效。')
    const manuscriptHash = fileHash(dir, row.entry.managedPath)
    if (manuscriptHash !== row.manuscriptHash) throw new Error('接力所需知识固定正文已变化。')
    const originalHash = row.originalHash === undefined ? undefined : fileHash(dir, row.entry.originalPath, 128 * 1024 * 1024)
    if (originalHash !== row.originalHash) throw new Error('接力所需知识固定原件已变化。')
    const identity = { slug, name: row.entry.name, category: row.entry.category, sourceHash: row.entry.sourceHash, metadata: metadata(row.entry), chunks: row.manifest.chunks, manuscriptHash, originalHash }
    if (digest(JSON.stringify(identity)) !== versionId) throw new Error('接力所需知识版本定位或适用范围已变化。')
    const result = { manuscriptHash, originalHash, metadataSha256: hash(identity) }
    versions.set(key, result)
    return result
  }

  const root = input.knowledgeRoot || process.env.AGENT_PI_KB_ROOT || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'knowledge-base') : undefined)
  const knowledge: TaskMandateSnapshot['knowledge'] = [], templates: TaskMandateSnapshot['templates'] = []
  if (root) {
    const selected = json(root, join(root, 'task-selection.json'), true)
    if (selected && (selected.schemaVersion !== 1 || !selected.bySession || typeof selected.bySession !== 'object' || Array.isArray(selected.bySession))) throw new Error('接力知识选用记录无效。')
    const rawSlugs = selected?.bySession[input.sessionId] || []
    if (!Array.isArray(rawSlugs) || rawSlugs.length > 128) throw new Error('接力知识选用范围无效或过大。')
    const slugs = [...new Set(rawSlugs)] as string[]
    slugs.forEach(slug => assertIdentifier(slug))
    const registry = slugs.length ? json(root, join(root, 'registry.json')) : undefined
    if (slugs.length && (registry?.schemaVersion !== 1 || !Array.isArray(registry.entries))) throw new Error('接力知识目录缺失或无效。')
    for (const slug of slugs.sort()) {
      const matches = registry.entries.filter((entry: any) => entry.slug === slug)
      if (matches.length !== 1 || matches[0].parseStatus && matches[0].parseStatus !== 'ready') throw new Error('接力选用的知识来源缺失、重复或尚未解析。')
      const entry = matches[0]
      const manifest = json(root, join(root, 'index', slug + '.json'))
      if (manifest?.slug !== slug || !Array.isArray(manifest.chunks)) throw new Error('接力知识正文定位缺失。')
      if (entry.versionId) {
        const fixed = version(root, slug, entry.versionId)
        // Retrieval uses the current managed manuscript, not only its retained copy.
        if (fileHash(root, entry.managedPath) !== fixed.manuscriptHash) throw new Error('接力选用的知识正文与登记版本不一致。')
        const currentIdentity = { slug, name: entry.name, category: entry.category, sourceHash: entry.sourceHash, metadata: metadata(entry), chunks: manifest.chunks, manuscriptHash: fixed.manuscriptHash, originalHash: fixed.originalHash }
        if (hash(currentIdentity) !== fixed.metadataSha256) throw new Error('接力选用的知识定位或适用范围与登记版本不一致。')
        knowledge.push({ slug, versionId: entry.versionId, sourceSha256: fixed.manuscriptHash, metadataSha256: fixed.metadataSha256 })
      } else {
        knowledge.push({ slug, versionId: null, sourceSha256: fileHash(root, entry.managedPath), metadataSha256: hash({ name: entry.name, category: entry.category, sourceHash: entry.sourceHash, metadata: metadata(entry), chunks: manifest.chunks }) })
      }
    }
    const binding = json(root, join(root, 'template-task-bindings', digest(input.sessionId) + '.json'), true)
    if (binding && (binding.schemaVersion !== 1 || binding.sessionId !== input.sessionId || !Array.isArray(binding.bindings) || binding.bindings.length > 1)) throw new Error('接力主范本绑定与原会话不一致。')
    for (const ref of binding?.bindings || []) {
      assertIdentifier(ref.slug); assertIdentifier(ref.versionId, shaPattern); assertIdentifier(ref.dnaId, shaPattern)
      if (!slugs.includes(ref.slug)) throw new Error('接力主范本不在本次选用知识范围。')
      const fixed = version(root, ref.slug, ref.versionId)
      const dir = join(root, 'template-dna', ref.slug, ref.versionId, ref.dnaId), profile = json(root, join(dir, 'profile.json'))
      const { dnaId, createdAt: _time, artifacts, ...content } = profile
      if (profile.schemaVersion !== 1 || dnaId !== ref.dnaId || profile.source?.slug !== ref.slug || profile.source.versionId !== ref.versionId || profile.source.manuscriptHash !== fixed.manuscriptHash || profile.source.originalHash !== fixed.originalHash || !artifacts) throw new Error('接力主范本 DNA 与固定来源不一致。')
      const artifactIdentity = Object.fromEntries(Object.entries(artifacts).map(([key, value]: [string, any]) => [key, { fileName: value.fileName, sha256: value.sha256 }]))
      if (digest(JSON.stringify({ ...content, artifacts: artifactIdentity })) !== dnaId) throw new Error('接力主范本 DNA 内容或版本已变化。')
      for (const [key, name] of Object.entries(layers)) {
        const artifact = artifacts[key]
        if (!artifact || artifact.fileName !== name || fileHash(dir, join(dir, name), 1024 * 1024) !== artifact.sha256) throw new Error('接力主范本分层产物缺失或变化。')
      }
      templates.push({ slug: ref.slug, versionId: ref.versionId, dnaId, profileSha256: hash({ ...content, artifacts: artifactIdentity }) })
    }
  } else if (input.task?.templateBindings?.length || input.task?.templateBindingIssue) throw new Error('接力主范本的知识库目录不可用。')

  const skillRoots = input.skillRoots ?? [process.env.AGENT_PI_SKILLS_ROOT || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'skills') : undefined)].filter(Boolean) as string[]
  const skillSlugs = [...new Set(input.skillSlugs || [])].sort(), skills: TaskMandateSnapshot['skills'] = []
  if (skillSlugs.length > 128 || skillRoots.length > 16) throw new Error('接力技能范围过大。')
  const winners = new Map<string, { id: string; path: string; root: string }>()
  if (input.skillFiles !== undefined) {
    if (!Array.isArray(input.skillFiles) || input.skillFiles.length > 128) throw new Error('接力技能目录观察无效或过大。')
    for (const file of input.skillFiles) {
      assertIdentifier(file?.id, skillPattern)
      if (!skillSlugs.includes(file.id) || winners.has(file.id)) throw new Error('接力技能目录的选用标识重复或不属于当前阶段。')
      winners.set(file.id, file)
    }
  }
  for (const id of skillSlugs) {
    assertIdentifier(id, skillPattern)
    if (input.skillFiles !== undefined) {
      const winner = winners.get(id)
      if (!winner) throw new Error(`接力所需技能没有当前宿主目录赢家：${id}`)
      skills.push({ id, sourcePath: resolve(winner.path), manifestSha256: fileHash(winner.root, winner.path, 1024 * 1024) })
      continue
    }
    let found = false
    for (const skillRoot of skillRoots) {
      const path = join(skillRoot, id, 'SKILL.md'), content = bytes(skillRoot, path, 1024 * 1024, true)
      if (content === undefined) continue
      skills.push({ id, sourcePath: resolve(path), manifestSha256: digest(content) }); found = true; break
    }
    if (!found) throw new Error(`接力所需技能缺失：${id}`)
  }
  const task = input.task
  const constraints = task ? {
    brief: Object.fromEntries(Object.entries(task.brief || {}).filter(([key]) => task.briefProvenance?.[key]?.origin === 'user' || task.briefProvenance?.[key]?.status === 'confirmed')),
    directives: (task.directives || []).filter(row => row.source === 'user' && row.status === 'active' && ['constraint', 'correction', 'scope', 'decision', 'revocation'].includes(row.kind)).map(({ id, key, kind, text, messageId }) => ({ id, key, kind, text, messageId })).sort((a, b) => a.id.localeCompare(b.id)),
  } : null
  const state = { schemaVersion: 1 as const, rootSessionId: input.sessionId, taskSha256: constraints === null ? null : hash(constraints), policyState: input.permissionPolicy === undefined ? 'not_configured' as const : 'configured' as const, policySha256: hash(input.permissionPolicy ?? { state: 'not_configured' }), knowledge, templates, skills }
  return { ...state, fingerprint: hash(state) }
}
