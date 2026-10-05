import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { createEngineeringProject, reviseEngineeringProject, engineeringInputFingerprint, validateEngineeringProject } from '../../../packages/engineering-core/index.ts'
import type { EngineeringProject, EngineeringProjectPatch, EngineeringDependency, EngineeringIssue } from '../../../packages/engineering-core/index.ts'
import { normalizeObservation, observedProject } from './observation.ts'
import type { EngineeringObservation } from './observation.ts'

export const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const within = (root: string, path: string) => { const part = relative(root, path); return part === '' || !part.startsWith('..') && !isAbsolute(part) }
const sourceHashCache = new Map<string, { signature: string; sha256: string; checkedAt: string }>()
const SOURCE_CACHE_LIMIT = 256
const fileSignature = (stat: BigIntStats) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
export interface EngineeringRun {
  id: string; providerId: string; providerVersion: string; title: string; createdAt: string; recordedRevision?: number
  executionStatus?: 'executed' | 'blocked'
  recordKind?: 'observation'
  dependencies: EngineeringDependency[]; dependencyFingerprint: string; input: unknown
  output: { summary: string; issues: EngineeringIssue[]; details: unknown }
}
export interface EngineeringState {
  schemaVersion: 1; revision: number; project: EngineeringProject; runs: EngineeringRun[]
  operations: Record<string, { digest: string; revision: number }>
}
export interface EngineeringSourceCheck {
  sourceId: string; status: 'current' | 'changed' | 'missing' | 'unverified' | 'outside_scope'; actualHash?: string; message?: string
  verification?: 'fresh' | 'cached'; checkedAt?: string
}
export const engineeringRunOperation = (run: Pick<EngineeringRun, 'providerId' | 'input' | 'dependencies'>) => ({ action: 'run', providerId: run.providerId, input: run.input, dependencies: run.dependencies })

/** Snapshot directory N is the commit; atomic rename cannot replace an occupied revision. */
export function createEngineeringStore(cwd: string, key: string, title: string, access: { sourceRoots?: string[]; sourcePaths?: string[] } = {}) {
  if (!key?.trim()) throw new Error('工程存储需要项目标识。')
  const root = realpathSync(cwd), directory = join(root, '.agent-pi', 'engineering', hash(key).slice(0, 32))
  const path = join(directory, 'project.json'), historyDirectory = join(directory, 'history')
  const assertInside = (target: string) => { if (existsSync(target) && !within(root, realpathSync(target))) throw new Error('工程存储路径超出当前工作目录。') }
  const prepare = () => {
    let target = root
    for (const part of ['.agent-pi', 'engineering', hash(key).slice(0, 32), 'history']) { target = join(target, part); assertInside(target); mkdirSync(target, { recursive: true }); assertInside(target) }
  }
  const snapshots = () => {
    assertInside(directory); assertInside(historyDirectory)
    return existsSync(historyDirectory) ? readdirSync(historyDirectory, { withFileTypes: true }).flatMap(entry => {
      const match = (entry.isDirectory() ? /^(\d+)$/ : /^(\d+)(?:-[a-f0-9]{64})?\.json$/).exec(entry.name)
      return match ? [{ revision: Number(match[1]), path: entry.isDirectory() ? join(historyDirectory, entry.name, 'project.json') : join(historyDirectory, entry.name) }] : []
    }).sort((a, b) => b.revision - a.revision) : []
  }
  const checkState = (state: EngineeringState): EngineeringState => {
    if (!state || state.schemaVersion !== 1 || !Number.isInteger(state.revision) || state.revision < 0 || state.project?.id !== key || !Array.isArray(state.runs) || !state.operations || typeof state.operations !== 'object' || Array.isArray(state.operations)) throw new Error('工程存储格式或项目标识不匹配。')
    validateEngineeringProject(state.project)
    return state
  }
  const read = (): EngineeringState => {
    const latest = snapshots()[0]
    if (latest) { assertInside(latest.path); const state = checkState(JSON.parse(readFileSync(latest.path, 'utf8'))); if (state.revision !== latest.revision) throw new Error('工程快照版本不匹配。'); return state }
    assertInside(path)
    return existsSync(path) ? checkState(JSON.parse(readFileSync(path, 'utf8'))) : { schemaVersion: 1, revision: 0, project: createEngineeringProject({ id: key, title }), runs: [], operations: {} }
  }
  const snapshotPath = (revision: number) => {
    const snapshot = snapshots().find(row => row.revision === revision)
    if (snapshot) { assertInside(snapshot.path); return snapshot.path }
    if (read().revision === revision && existsSync(path)) return path
    throw new Error('工程历史快照不存在。')
  }
  const checkOperation = (expected: number, operationId: string, payload: unknown) => {
    if (typeof operationId !== 'string' || !operationId.trim()) throw new Error('工程变更需要稳定 operationId，以便重试时避免重复登记。')
    const state = read(), digest = hash(canonical(payload)), prior = Object.hasOwn(state.operations, operationId) ? state.operations[operationId] : undefined
    if (prior) { if (prior.digest !== digest) throw new Error('operationId 已用于另一项工程变更。'); return { state, replayed: true, digest } }
    if (!Number.isInteger(expected) || state.revision !== expected) throw new Error('工程数据已变化，请读取最新版本后重试。')
    return { state, replayed: false, digest }
  }
  const mutate = (expected: number, operationId: string, payload: unknown, update: (state: EngineeringState) => EngineeringState) => {
    const checked = checkOperation(expected, operationId, payload)
    if (checked.replayed) return checked.state
    const next = update(structuredClone(checked.state))
    next.revision = checked.state.revision + 1
    Object.defineProperty(next.operations, operationId, { value: { digest: checked.digest, revision: next.revision }, enumerable: true, writable: true, configurable: true })
    checkState(next); prepare()
    const temporary = join(directory, `${randomUUID()}.tmp`), temporaryFile = join(temporary, 'project.json'), destination = join(historyDirectory, String(next.revision)), bytes = JSON.stringify(next, null, 2)
    try {
      mkdirSync(temporary)
      writeFileSync(temporaryFile, bytes, { flag: 'wx' })
      try { renameSync(temporary, destination) }
      catch (error: any) {
        if (!existsSync(join(destination, 'project.json'))) throw error
        const latest = checkOperation(expected, operationId, payload)
        if (latest.replayed) return latest.state
        throw new Error('工程数据已被另一执行者更新，请读取最新版本后重试。')
      }
    } finally { if (existsSync(temporaryFile)) unlinkSync(temporaryFile); if (existsSync(temporary)) rmdirSync(temporary) }
    // The replaceable head is only a cache; history remains readable after cache failure.
    const cache = `${path}.${randomUUID()}.tmp`
    try { writeFileSync(cache, bytes, { flag: 'wx' }); renameSync(cache, path) } catch { /* committed above */ }
    finally { if (existsSync(cache)) unlinkSync(cache) }
    return next
  }
  const sourceChecks = (state: EngineeringState, options: { force?: boolean; sourceIds?: string[] } = {}): EngineeringSourceCheck[] => state.project.sources.filter(source => !options.sourceIds || options.sourceIds.includes(source.id)).map(source => {
    if (!source.path) return { sourceId: source.id, status: 'unverified', message: '来源未提供可核验本地文件，仅保留已登记依据，不能证明原文件覆盖。' }
    const candidate = resolve(root, source.path), roots = [root, ...(access.sourceRoots || []).map(value => resolve(root, value))], selected = (access.sourcePaths || []).map(value => resolve(root, value))
    try {
      const allowed = roots.some(value => within(value, candidate)) || selected.some(value => candidate === value || existsSync(value) && statSync(value).isDirectory() && within(value, candidate))
      if (!allowed) return { sourceId: source.id, status: 'outside_scope', message: '来源路径不在当前工作目录或该项目已登记的输入范围内。' }
      const actualPath = realpathSync(candidate), realRoots = roots.filter(existsSync).map(value => realpathSync(value)), realSelected = selected.filter(existsSync).map(value => realpathSync(value))
      if (!realRoots.some(value => within(value, actualPath)) && !realSelected.some(value => value === actualPath || statSync(value).isDirectory() && within(value, actualPath))) return { sourceId: source.id, status: 'outside_scope', message: '来源实际路径超出已登记项目范围。' }
      const before = statSync(actualPath, { bigint: true }), signature = fileSignature(before)
      if (!before.isFile()) return { sourceId: source.id, status: 'missing', message: '来源不是可读取的普通文件。' }
      const cached = sourceHashCache.get(actualPath)
      let value = !options.force && cached?.signature === signature ? cached : undefined
      const verification = value ? 'cached' : 'fresh'
      if (!value) {
        const file = openSync(actualPath, 'r'), digest = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
        let stable = false
        try {
          const opened = fileSignature(fstatSync(file, { bigint: true }))
          let count: number; while ((count = readSync(file, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, count))
          stable = signature === opened && opened === fileSignature(fstatSync(file, { bigint: true })) && signature === fileSignature(statSync(actualPath, { bigint: true }))
        } finally { closeSync(file) }
        if (!stable) { sourceHashCache.delete(actualPath); return { sourceId: source.id, status: 'changed', message: '核验期间文件发生变化，本次没有采用不稳定的来源哈希。' } }
        value = { signature, sha256: digest.digest('hex'), checkedAt: new Date().toISOString() }
      }
      sourceHashCache.delete(actualPath); sourceHashCache.set(actualPath, value)
      if (sourceHashCache.size > SOURCE_CACHE_LIMIT) sourceHashCache.delete(sourceHashCache.keys().next().value!)
      const actualHash = value.sha256
      return { sourceId: source.id, actualHash, verification, checkedAt: value.checkedAt, status: actualHash === source.sha256 ? 'current' : 'changed', ...(actualHash === source.sha256 ? {} : { message: '实际文件内容已变化；原登记哈希与参数依据已保留，请核对变更后重新登记。' }) }
    } catch { return { sourceId: source.id, status: 'missing', message: '无法读取已登记来源文件，请核对路径和访问权限。' } }
  })
  const dependencySourceIds = (project: EngineeringProject, dependencies: EngineeringDependency[], visited = new Set<string>()): Set<string> => {
    const ids = new Set<string>()
    for (const ref of dependencies) {
      if (ref.kind === 'source') ids.add(ref.id)
      else if (ref.kind === 'rule') for (const source of project.ruleAdoptions.find(row => row.id === ref.id)?.sources || []) ids.add(source.sourceId)
      else if (ref.kind === 'quantity') {
        if (visited.has(ref.id)) continue
        visited.add(ref.id)
        for (const id of dependencySourceIds(project, project.quantities.find(row => row.id === ref.id)?.dependencies || [], visited)) ids.add(id)
      } else {
        const object = project.objects.find(row => row.id === ref.id)
        if (!object) continue
        const refs = ref.kind === 'parameter' ? object.parameters[ref.parameter]?.sources || [] : [...object.sources, ...Object.values(object.parameters).flatMap(row => row.sources)]
        for (const source of refs) ids.add(source.sourceId)
      }
    }
    return ids
  }
  const sourceIssues = (state: EngineeringState, dependencies: EngineeringDependency[], checks = sourceChecks(state)): EngineeringIssue[] => {
    const ids = dependencySourceIds(state.project, dependencies)
    return checks.filter(row => ids.has(row.sourceId) && row.status !== 'current').map(row => ({ code: `engineering_source_${row.status}`, severity: row.status === 'unverified' ? 'warning' : 'error', message: `${row.sourceId}：${row.message}`, entityId: row.sourceId }))
  }
  const verifySources = (state: EngineeringState, dependencies: EngineeringDependency[]) => sourceIssues(state, dependencies, sourceChecks(state, { force: true, sourceIds: [...dependencySourceIds(state.project, dependencies)] }))
  return {
    path, read, snapshotPath, checkOperation, sourceChecks, sourceIssues, verifySources,
    observe(value: EngineeringObservation) {
      const observation = normalizeObservation(value), payload = { action: 'observe', observation }, observationFingerprint = hash(canonical(payload)), current = read()
      const latest = current.runs.findLast(run => run.recordKind === 'observation' && run.providerId === `reader.${observation.kind}` && (run.output.details as EngineeringObservation)?.source?.path === observation.source.path)
      if (latest && (latest.input as { observationFingerprint?: string })?.observationFingerprint === observationFingerprint) {
        let sameInputs = false
        try { sameInputs = engineeringInputFingerprint(current.project, latest.dependencies) === latest.dependencyFingerprint } catch { /* A removed source needs a new observation. */ }
        if (sameInputs && !verifySources(current, latest.dependencies).some(row => row.severity === 'error')) return current
      }
      const operationId = `observe:${current.revision}:${observationFingerprint}`
      return mutate(current.revision, operationId, payload, state => {
        const result = observedProject(state.project, observation, root), next = { ...state, project: result.project }
        const problems = verifySources(next, result.dependencies)
        if (problems.some(row => row.severity === 'error')) throw new Error(problems.map(row => row.message).join('；'))
        const run: EngineeringRun = { id: randomUUID(), recordKind: 'observation', providerId: `reader.${observation.kind}`, providerVersion: '3.8.0', title: observation.kind === 'pdf' ? 'PDF 图纸读取' : 'CAD 图纸读取', createdAt: new Date().toISOString(), recordedRevision: state.revision + 1, executionStatus: 'executed', dependencies: result.dependencies, dependencyFingerprint: result.dependencyFingerprint, input: { observationFingerprint, parameterFingerprint: observation.parameterFingerprint, observedIds: observation.observedIds }, output: { summary: observation.summary, issues: [{ code: 'drawing_review_pending', severity: 'warning', message: '提取和渲染仅为读图记录，尚不能证明专业复核或构件完整覆盖。' }], details: { ...observation, sourceId: result.sourceId } } }
        return { ...next, runs: [...next.runs, run] }
      })
    },
    patch(patch: EngineeringProjectPatch, revision: number, operationId: string) {
      return mutate(revision, operationId, { action: 'update', patch }, state => ({ ...state, project: reviseEngineeringProject(state.project, patch, state.project.revision) }))
    },
    record(run: EngineeringRun, revision: number, operationId: string) {
      return mutate(revision, operationId, engineeringRunOperation(run), state => {
        if (engineeringInputFingerprint(state.project, run.dependencies) !== run.dependencyFingerprint) throw new Error('计算过程中工程依据已变化，请重新计算。')
        if (state.runs.some(row => row.id === run.id)) throw new Error('工程计算编号重复。')
        const changedSources = verifySources(state, run.dependencies).filter(row => row.severity === 'error')
        if (changedSources.length && run.executionStatus !== 'blocked') throw new Error(changedSources.map(row => row.message).join('；'))
        return { ...state, runs: [...state.runs, { ...run, recordedRevision: state.revision + 1 }] }
      })
    },
    runStatus(state: EngineeringState, run: EngineeringRun, checks = sourceChecks(state)): 'current' | 'stale' {
      try { return engineeringInputFingerprint(state.project, run.dependencies) === run.dependencyFingerprint && !sourceIssues(state, run.dependencies, checks).some(row => row.severity === 'error') ? 'current' : 'stale' } catch { return 'stale' }
    },
  }
}
