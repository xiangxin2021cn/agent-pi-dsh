export interface LongTaskExternalChild {
  id: string
  parentSessionId: string
  runId?: string
  provider?: string
  /** Host-observed start, or the original parent's durable catalog creation time. */
  startedAt?: number
  settledAt?: number
  settlement?: 'lifecycle' | 'native-notice'
  stopReason?: string
  receiptMessageId?: string
  tokens: 'unreported'
}
export type LongTaskExternalChildren = Record<string, LongTaskExternalChild>
interface RunInfo { id: string; runId: string; provider: string; local: boolean }
type LifecycleEvent =
  | { type: 'subagent/start'; info: RunInfo; observedAt: number }
  | { type: 'subagent/end'; info: RunInfo & { stopReason: string }; observedAt: number }
interface ParentSnapshot {
  session: { id: string }
  inheritedEventCount?: number
  events: readonly { type: string; seq: number; time: number; data: unknown }[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function time(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }
function owned(children: LongTaskExternalChildren, id: string, parentSessionId: string) {
  const child = Object.hasOwn(children, id) ? children[id] : undefined
  if (child && (child.id !== id || child.parentSessionId !== parentSessionId)) throw new Error('外部子任务的原父会话归属冲突。')
  return child
}

/** The caller supplies the exact scoped parent; native lifecycle info has no parent field. */
export function foldLongTaskExternal(children: LongTaskExternalChildren | undefined, parentSessionId: string, event: LifecycleEvent): LongTaskExternalChildren {
  const previous = children || {}, info = event.info
  if (!text(parentSessionId) || !text(info.id) || info.id === parentSessionId || !text(info.runId) || !text(info.provider) || !time(event.observedAt) || typeof info.local !== 'boolean' || event.type === 'subagent/end' && !text(event.info.stopReason)) throw new Error('外部子任务生命周期收据无效。')
  if (info.local) return previous
  const old = owned(previous, info.id, parentSessionId)
  if (old && (old.runId !== undefined && old.runId !== info.runId || old.provider !== undefined && old.provider !== info.provider)) throw new Error('外部子任务的激活标识或提供方冲突。')
  if (event.type === 'subagent/end' && old?.stopReason !== undefined && old.stopReason !== event.info.stopReason) throw new Error('同一外部激活的终态收据冲突。')
  const child: LongTaskExternalChild = { ...old, id: info.id, parentSessionId, runId: info.runId, provider: info.provider, tokens: 'unreported' }
  if (event.type === 'subagent/start') {
    child.startedAt ??= event.observedAt
  } else {
    child.settledAt ??= event.observedAt
    child.settlement = 'lifecycle'
    child.stopReason = event.info.stopReason
  }
  return { ...previous, [info.id]: child }
}

/** Catalog presence proves parent ownership, never completion or a successful artifact. */
export function recoverLongTaskExternal(children: LongTaskExternalChildren | undefined, parentSessionId: string, snapshot: ParentSnapshot, fromSeq = 0): LongTaskExternalChildren {
  if (!text(parentSessionId) || snapshot.session.id !== parentSessionId || !time(fromSeq) || !time(snapshot.inheritedEventCount ?? 0)) throw new Error('外部子任务恢复必须核对原父会话日志。')
  let next = children || {}
  for (const event of snapshot.events) {
    if (event.seq < Math.max(fromSeq, snapshot.inheritedEventCount || 0) || !record(event.data)) continue
    if (event.type === 'subagent/catalog' && event.data.version === 2 && event.data.mode === 'external') {
      const id = event.data.childId, createdAt = event.data.childCreatedAt
      if (!text(id) || id === parentSessionId || !time(createdAt)) throw new Error('原父会话的外部子任务目录收据无效。')
      const old = owned(next, id, parentSessionId)
      next = { ...next, [id]: { ...old, id, parentSessionId, startedAt: old?.startedAt ?? createdAt, tokens: 'unreported' } }
    } else if (event.type === 'user/message' || event.type === 'agent/inbox/spliced') {
      const messages = event.type === 'user/message' ? [event.data] : Array.isArray(event.data.inserted) ? event.data.inserted : []
      for (const message of messages) {
        if (!record(message) || message.role !== 'user' || !text(message.id) || !record(message.source) || message.source.kind !== 'subagent-settled' || message.source.form !== 'notice' || !text(message.source.senderSessionId)) continue
        const id = message.source.senderSessionId, old = owned(next, id, parentSessionId)
        // An unowned notice cannot create or settle a child of this attempt.
        if (!old) continue
        if (!time(event.time)) throw new Error('外部子任务的终态通知缺少真实日志时间。')
        next = { ...next, [id]: { ...old, settledAt: old.settledAt ?? event.time, settlement: old.settlement ?? 'native-notice', receiptMessageId: old.receiptMessageId ?? message.id } }
      }
    }
  }
  return next
}

/** Worker wall intervals can overlap; external tokens are absent from native provider usage. */
export function longTaskExternalFence(children: LongTaskExternalChildren | undefined, now: number) {
  if (!time(now)) throw new Error('外部子任务观察时间无效。')
  const rows = Object.values(children || {})
  return {
    pending: rows.filter(child => child.settledAt === undefined).map(child => child.id),
    unreportedTokens: rows.length > 0,
    elapsed: rows.map(child => ({ id: child.id, ...(child.startedAt !== undefined && (child.settledAt ?? now) >= child.startedAt ? { elapsedMs: (child.settledAt ?? now) - child.startedAt } : {}) })),
  }
}
