import { isAbsolute, resolve } from 'node:path'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { LongTaskAttempt, LongTaskRun, LongTaskStatus } from './long-task-runtime.ts'

interface RecoveryRegistry {
  list(): readonly { path: string; sessionIds: readonly string[] }[]
  readonly archivedSessionIds: readonly string[]
}
export interface LongTaskRecoveryCandidate { cwd: string; sessionId: string; project: BusinessProjectRecord }
interface RecoveryCallbacks {
  projectForBoundSession(cwd: string, sessionId: string): BusinessProjectRecord | null | undefined
  listLongTasks(cwd: string, project: BusinessProjectRecord): readonly LongTaskRun[]
  status(cwd: string, project: BusinessProjectRecord, sessionId: string): LongTaskStatus
  hasRecoveryContext(run: LongTaskRun, attempt: LongTaskAttempt): boolean
  reportError(failure: { cwd?: string; sessionId?: string; projectId?: string; error: unknown }): void
}

/** Discover only durable runs in registered workspaces; loading or dispatch belongs to the host. */
export function discoverLongTaskRecovery(registry: RecoveryRegistry, callbacks: RecoveryCallbacks): LongTaskRecoveryCandidate[] {
  const archived = new Set(registry.archivedSessionIds), seen = new Set<string>()
  const projects = new Map<string, readonly LongTaskRun[] | null>(), candidates: LongTaskRecoveryCandidate[] = []
  for (const workspace of registry.list()) {
    let cwd: string
    try {
      if (!workspace.path || !isAbsolute(workspace.path) || !Array.isArray(workspace.sessionIds)) throw new Error('恢复工作区缺少有效的绝对路径或会话登记。')
      cwd = resolve(workspace.path)
    } catch (error) { callbacks.reportError({ error }); continue }
    for (const sessionId of workspace.sessionIds) {
      if (!sessionId || archived.has(sessionId)) continue
      const identity = JSON.stringify([cwd, sessionId])
      if (seen.has(identity)) continue
      seen.add(identity)
      let project: BusinessProjectRecord | null | undefined
      try {
        project = callbacks.projectForBoundSession(cwd, sessionId)
        if (!project) continue
        const key = JSON.stringify([cwd, project.module, project.projectId])
        if (!projects.has(key)) {
          try { projects.set(key, callbacks.listLongTasks(cwd, project)) }
          catch (error) { projects.set(key, null); throw error }
        }
        const runs = projects.get(key)
        if (!runs) continue
        const matching = runs.filter(run => run.sessionId === sessionId)
        if (!matching.length) continue
        if (matching.length !== 1) throw new Error('恢复记录中同一主会话存在重复的长期任务。')
        if (matching[0].paused) continue
        const status = callbacks.status(cwd, project, sessionId)
        if (!['ready', 'waiting'].includes(status.phase)) continue
        const { run, attempt } = status
        if (!run || !attempt || run.paused || run.sessionId !== sessionId || attempt.sessionId !== sessionId || attempt.id !== run.currentAttemptId || !run.attempts.some(row => row.id === attempt.id)) throw new Error('恢复状态与登记的原主会话或当前尝试不匹配。')
        if (!['prepared', 'dispatching', 'dispatched', 'settled'].includes(attempt.status) || !callbacks.hasRecoveryContext(run, attempt)) continue
        candidates.push({ cwd, sessionId, project })
      } catch (error) { callbacks.reportError({ cwd, sessionId, ...(project ? { projectId: project.projectId } : {}), error }) }
    }
  }
  return candidates
}
