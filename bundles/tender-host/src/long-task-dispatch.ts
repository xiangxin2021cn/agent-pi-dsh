import { resolve } from 'node:path'

interface DispatchAttempt { sessionId: string; messageId?: string; draft: string }
interface DispatchSnapshot {
  session: { id: string; cwd?: string; origin?: string }
  inheritedEventCount?: number
  events: readonly { type: string; seq: number; data: unknown }[]
}
export type LongTaskDispatchReceipt = { state: 'found'; messageId: string } | { state: 'unknown' }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Read an existing intent's durable native message; absence never authorizes a retry. */
export function inspectLongTaskDispatchReceipt(cwd: string, sessionId: string, attempt: DispatchAttempt, snapshot: DispatchSnapshot): LongTaskDispatchReceipt {
  if (attempt.sessionId !== sessionId || snapshot.session.id !== sessionId || !snapshot.session.cwd || resolve(snapshot.session.cwd) !== resolve(cwd) || snapshot.session.origin === 'subagent') {
    throw new Error('派发收据的原主会话或工作区不匹配。')
  }
  if (!attempt.messageId) return { state: 'unknown' }
  let found = false
  const check = (message: unknown) => {
    if (!record(message) || message.id !== attempt.messageId) return
    const content = message.content, source = message.source
    if (message.role !== 'user' || !Array.isArray(content) || content.length !== 1 || !record(content[0]) || content[0].type !== 'text' || content[0].text !== attempt.draft || Object.keys(content[0]).length !== 2 || !record(source) || source.kind !== 'plugin:tender-host' || source.form !== 'instructions' || Object.keys(source).length !== 2) {
      throw new Error('原主会话中相同派发消息标识的内容或来源冲突，需要核对后恢复。')
    }
    found = true
  }
  for (const event of snapshot.events) {
    if (event.seq < (snapshot.inheritedEventCount || 0) || !record(event.data)) continue
    if (event.type === 'user/message') check(event.data)
    else if (event.type === 'agent/inbox/spliced' && Array.isArray(event.data.inserted)) {
      for (const message of event.data.inserted) check(message)
    }
  }
  return found ? { state: 'found', messageId: attempt.messageId } : { state: 'unknown' }
}
