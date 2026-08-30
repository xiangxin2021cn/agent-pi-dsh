export type SessionTransactionPhase =
  | 'prepared'
  | 'committed'
  | 'succeeded'
  | 'failed'
  | 'destroyed'

export interface SessionTransaction<TPayload> {
  sessionId: string
  phase: SessionTransactionPhase
  payload: TPayload
  preparedAt: number
  committedAt?: number
  settledAt?: number
  error?: string
}

export interface SessionTransactionRegistry<TPayload> {
  get(sessionId: string): SessionTransaction<TPayload> | undefined
  prepare(sessionId: string, payload: TPayload): SessionTransaction<TPayload>
  commit(sessionId: string): SessionTransaction<TPayload>
  succeed(sessionId: string): SessionTransaction<TPayload>
  fail(sessionId: string, error: unknown): SessionTransaction<TPayload>
  destroy(sessionId: string): SessionTransaction<TPayload> | undefined
  canRun(sessionId: string): boolean
  committed(): SessionTransaction<TPayload>[]
}

function requireSessionId(sessionId: string): string {
  const value = String(sessionId || '').trim()
  if (!value) throw new Error('session transaction requires a session id')
  return value
}

function copy<TPayload>(value: SessionTransaction<TPayload>): SessionTransaction<TPayload> {
  return { ...value }
}

/**
 * In-memory, per-session transaction registry for product-layer automation.
 * Nothing may run after prepare alone: the user action must explicitly commit it.
 */
export function createSessionTransactionRegistry<TPayload>(
  now: () => number = Date.now,
  restored: ReadonlyArray<SessionTransaction<TPayload>> = [],
): SessionTransactionRegistry<TPayload> {
  const entries = new Map<string, SessionTransaction<TPayload>>()
  for (const value of restored) {
    const sessionId = String(value?.sessionId || '').trim()
    if (!sessionId || value.phase !== 'committed' || value.payload == null) continue
    entries.set(sessionId, copy({ ...value, sessionId }))
  }

  const current = (sessionId: string): SessionTransaction<TPayload> => {
    const id = requireSessionId(sessionId)
    const value = entries.get(id)
    if (!value) throw new Error(`session transaction not prepared: ${id}`)
    return value
  }

  return {
    get(sessionId) {
      const value = entries.get(String(sessionId || '').trim())
      return value ? copy(value) : undefined
    },
    prepare(sessionId, payload) {
      const id = requireSessionId(sessionId)
      const previous = entries.get(id)
      if (previous?.phase === 'prepared' || previous?.phase === 'committed') {
        throw new Error(`session transaction already active: ${id}`)
      }
      const value: SessionTransaction<TPayload> = {
        sessionId: id,
        phase: 'prepared',
        payload,
        preparedAt: now(),
      }
      entries.set(id, value)
      return copy(value)
    },
    commit(sessionId) {
      const value = current(sessionId)
      if (value.phase !== 'prepared') {
        throw new Error(`session transaction cannot commit from ${value.phase}`)
      }
      value.phase = 'committed'
      value.committedAt = now()
      return copy(value)
    },
    succeed(sessionId) {
      const value = current(sessionId)
      if (value.phase !== 'committed') {
        throw new Error(`session transaction cannot succeed from ${value.phase}`)
      }
      value.phase = 'succeeded'
      value.settledAt = now()
      delete value.error
      return copy(value)
    },
    fail(sessionId, error) {
      const value = current(sessionId)
      if (value.phase !== 'prepared' && value.phase !== 'committed') {
        throw new Error(`session transaction cannot fail from ${value.phase}`)
      }
      value.phase = 'failed'
      value.settledAt = now()
      value.error = String(error instanceof Error ? error.message : error || 'unknown error')
      return copy(value)
    },
    destroy(sessionId) {
      const id = requireSessionId(sessionId)
      const value = entries.get(id)
      if (!value) return undefined
      value.phase = 'destroyed'
      value.settledAt = now()
      entries.delete(id)
      return copy(value)
    },
    canRun(sessionId) {
      return entries.get(String(sessionId || '').trim())?.phase === 'committed'
    },
    committed() {
      return [...entries.values()]
        .filter((value) => value.phase === 'committed')
        .map(copy)
    },
  }
}
