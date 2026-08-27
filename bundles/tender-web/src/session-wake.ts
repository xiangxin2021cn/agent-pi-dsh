/** Detect unanswered child returns / queued parent input so the workbench can wake the main session. */

export type WakeKind = 'child-return' | 'user'

export type SessionWakeHit = {
  kind: WakeKind
  text: string
}

type WakeNode = {
  kind?: string
  blocks?: Array<{ kind?: string; text?: string } | null> | undefined
  content?: Array<{ type?: string; text?: string } | null> | undefined
  text?: string | undefined
}

type WakeSnap = {
  running?: boolean
  queue?: ReadonlyArray<{ id?: string; placement?: string } | null> | undefined
  nodes?: WakeNode[] | undefined
  chat?: { legacy?: { nodes?: WakeNode[] | undefined } | undefined } | undefined
  subagent?: { address?: { parentSessionId?: string } | undefined } | null | undefined
}

type SessionListSnap = {
  byId?: Readonly<Record<string, {
    id?: string
    origin?: string
    parentId?: string
    running?: boolean
  } | undefined>> | undefined
}

const CHILD_RETURN_RE = /(ACCEPT_AND_PROCEED|REVISE_AND_RETRY|\bDONE\b|Background subagent\s+\S+\s+(?:reported|finished|was stopped|ran out of room|declined the task|failed before it finished))/i

/** Parent is in an open turn. Queue-only is not running. */
export function snapshotIsRunning(snap: WakeSnap | null | undefined): boolean {
  return !!(snap && snap.running)
}

/** Still-pending composer/host queue rows. */
export function queuedMessages(snap: WakeSnap | null | undefined): Array<{ id: string; placement: string }> {
  const queue = snap && Array.isArray(snap.queue) ? snap.queue : []
  const out: Array<{ id: string; placement: string }> = []
  for (const item of queue) {
    if (!item || !item.id) continue
    if (item.placement && item.placement !== 'queued') continue
    out.push({ id: item.id, placement: item.placement || 'queued' })
  }
  return out
}

/** Busy for crash-resume / UI: running or a waiting queue. */
export function snapshotIsBusy(snap: WakeSnap | null | undefined): boolean {
  return snapshotIsRunning(snap) || queuedMessages(snap).length > 0
}

/** Root main-session routing target for a workbench action opened from any descendant. */
export function parentSessionTarget(
  activeId: string,
  snap: WakeSnap | null | undefined,
  list?: SessionListSnap | null,
): string {
  const byId = list?.byId ?? {}
  let target = snap?.subagent?.address?.parentSessionId || activeId
  const seen = new Set<string>()
  while (target && !seen.has(target)) {
    seen.add(target)
    const row = byId[target]
    if (!row || row.origin !== 'subagent' || !row.parentId) break
    target = row.parentId
  }
  return target
}

/** Live parent/descendant activity shown beside the disk-backed stage board. */
export function sessionActivity(list: SessionListSnap | null | undefined, parentId: string): {
  parentRunning: boolean
  childCount: number
  runningChildCount: number
} {
  const byId = list?.byId ?? {}
  let childCount = 0
  let runningChildCount = 0
  if (parentId) {
    for (const child of Object.values(byId)) {
      if (!child || child.origin !== 'subagent' || !child.id) continue
      const seen = new Set<string>()
      let cursor: typeof child | undefined = child
      let belongs = false
      while (cursor?.origin === 'subagent' && cursor.parentId && !seen.has(cursor.id || '')) {
        if (cursor.id) seen.add(cursor.id)
        if (cursor.parentId === parentId) {
          belongs = true
          break
        }
        cursor = byId[cursor.parentId]
      }
      if (!belongs) continue
      childCount += 1
      if (child.running) runningChildCount += 1
    }
  }
  return {
    parentRunning: Boolean(parentId && byId[parentId]?.running),
    childCount,
    runningChildCount,
  }
}

/** A disk-stage must not auto-resume while its parent or any descendant is executing. */
export function sessionExecutionActive(
  parentSnap: WakeSnap | null | undefined,
  list: SessionListSnap | null | undefined,
  parentId: string,
): boolean {
  const activity = sessionActivity(list, parentId)
  return snapshotIsRunning(parentSnap) || activity.parentRunning || activity.runningChildCount > 0
}

export function nodeText(node: WakeNode | null | undefined): string {
  if (!node) return ''
  const chunks: string[] = []
  const blocks = node.blocks || node.content || []
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (block && typeof block.text === 'string' && block.text) chunks.push(block.text)
    }
  }
  if (typeof node.text === 'string' && node.text) chunks.push(node.text)
  return chunks.join('\n')
}

export function isChildReturnText(text: string): boolean {
  return CHILD_RETURN_RE.test(String(text || ''))
}

/** Workbench-injected wake; do not treat it as another unanswered inbound. */
export function isWorkbenchWakeText(text: string): boolean {
  return /^(【子代理回推】|【主对话未接续】|【主对话插话】|【评审回推】)/.test(String(text || '').trim())
}

function nodeLists(snap: WakeSnap | null | undefined): WakeNode[][] {
  if (!snap) return []
  const lists: WakeNode[][] = []
  if (Array.isArray(snap.nodes)) lists.push(snap.nodes)
  if (snap.chat && snap.chat.legacy && Array.isArray(snap.chat.legacy.nodes)) lists.push(snap.chat.legacy.nodes)
  return lists
}

/** Latest child DONE / settlement / review verdict visible on a session snapshot. */
export function lastChildReturn(snap: WakeSnap | null | undefined): string {
  for (const list of nodeLists(snap)) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const node = list[i]
      const text = nodeText(node).trim()
      if (!text && node?.kind === 'assistant') continue
      if (!text && !node?.kind) continue
      return isChildReturnText(text) ? text : ''
    }
  }
  return ''
}

/**
 * If the last meaningful node is an inbound user/child-return and the parent
 * has not spoken after it, the main session needs a waking prompt.
 */
export function inboundNeedsParentWake(snap: WakeSnap | null | undefined): SessionWakeHit | null {
  for (const list of nodeLists(snap)) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const node = list[i]
      if (!node) continue
      const text = nodeText(node).trim()
      if (node.kind === 'context' && text && isChildReturnText(text)) {
        return { kind: 'child-return', text }
      }
      if (node.kind === 'user' && text) {
        if (isWorkbenchWakeText(text)) return null
        return { kind: isChildReturnText(text) ? 'child-return' : 'user', text }
      }
      if (node.kind === 'assistant' && !text) continue
      if (node.kind && node.kind !== 'user') return null
    }
  }
  return null
}

/** Frame a workbench wake so the parent continues instead of sitting idle. */
export function buildParentWakePrompt(hit: SessionWakeHit): string {
  const excerpt = hit.text.length > 1200 ? `${hit.text.slice(0, 1200)}\n…` : hit.text
  if (hit.kind === 'child-return') {
    return '【子代理回推】子智能体已 report/settled。请立刻核验磁盘成果并继续本阶段，不要再空等 DONE。\n\n' + excerpt
  }
  return '【主对话未接续】用户已在本主会话提交指令，但主会话没有继续。请立刻处理这条指令，不要空等。\n\n' + excerpt
}
