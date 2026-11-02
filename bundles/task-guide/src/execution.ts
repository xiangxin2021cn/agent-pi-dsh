import type { LongTaskStatus } from '../../tender-host/src/long-task-runtime.ts'

/** A read-only projection: never expose prompts, tool arguments or mutable run records. */
export function taskExecutionProjection(rootSessionId: string, status: LongTaskStatus) {
  const { run, attempt } = status
  if (run && run.sessionId !== rootSessionId) throw new Error('执行状态不属于原主会话。')
  return {
    rootSessionId, phase: status.phase, reason: status.reason, stageId: run?.stageId,
    ...(attempt ? { attempt: { id: attempt.id, status: attempt.status, inputFingerprint: attempt.inputFingerprint, createdAt: attempt.createdAt } } : {}),
    ...(run ? {
      usage: { rounds: run.usage.rounds, tokens: run.usage.tokens, elapsedMs: run.usage.elapsedMs, unknownTokens: run.usage.unknownTokens },
      limits: { maxRounds: run.limits.maxRounds, maxTokens: run.limits.maxTokens, maxElapsedMs: run.limits.maxElapsedMs, maxNoProgress: run.limits.maxNoProgress },
      noProgress: run.noProgress,
    } : {}),
    pendingToolCount: attempt?.pendingToolCalls?.length || 0,
    unsettledChildCount: Object.values(attempt?.children || {}).filter(row => !row.settledAt).length,
    ...(status.external ? { external: { pendingCount: status.external.pending.length, needsReviewCount: status.external.needsReview.length, failedCount: status.external.failed.length, tokens: 'unreported' as const } } : {}),
    ...(attempt?.context ? { context: { fingerprint: attempt.context.fingerprint, knowledgeCount: attempt.context.knowledge.length, templateCount: attempt.context.templates.length, skillCount: attempt.context.skills.length, policyState: attempt.context.policyState } } : {}),
  }
}
