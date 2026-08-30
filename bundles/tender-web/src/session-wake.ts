/** Detect unanswered child returns / queued parent input so the workbench can wake the main session. */

export type WakeKind = 'child-return' | 'user' | 'transaction-continuation'

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
  return /^(【子代理回推】|【主对话未接续】|【主对话插话】|【评审回推】|【事务自动接续】)/.test(String(text || '').trim())
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

const HUMAN_APPROVAL_RE = /(?:是否(?:投标|不投标)|投标\s*[\/／]\s*不投标|重大(?:履约)?风险|价格基准|冻结(?:价格|报价|版本)?|最终提交|提交投标|批准提交|签字|签署|人工(?:确认|决策|审批)|强制放行|付款|发布)/i
const MECHANICAL_CONTINUATION_RE = /(?:小批次|workflow|继续(?:推进|执行|处理|补齐|完成|组价)|补全|剩余|直至\s*complete_stage)/i
const CONTINUATION_QUESTION_RE = /(?:是否(?:按(?:此|上述|该方案))?继续|是否继续(?:执行|推进|处理|补齐|组价)?|要(?:我|不要)?继续|可以继续吗)[？?]?\s*$/i

/**
 * Detect a narrow class of assistant self-pauses that do not ask for a new
 * business decision. The committed session transaction already authorizes
 * mechanical batching; real bid, price-freeze and submission gates stay manual.
 */
export function assistantNeedsTransactionContinuation(snap: WakeSnap | null | undefined): SessionWakeHit | null {
  for (const list of nodeLists(snap)) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const node = list[i]
      if (!node) continue
      const text = nodeText(node).trim()
      if (node.kind === 'assistant' && !text) continue
      if (node.kind !== 'assistant' || !text) return null
      const tail = text.slice(-600)
      if (HUMAN_APPROVAL_RE.test(tail)) return null
      if (!MECHANICAL_CONTINUATION_RE.test(tail) || !CONTINUATION_QUESTION_RE.test(tail)) return null
      return { kind: 'transaction-continuation', text: tail }
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
  if (hit.kind === 'transaction-continuation') {
    return '【事务自动接续】本会话的「继续推进」事务仍有效；这只是已授权阶段内的机械分批，不需要再次询问是否继续。请直接核验磁盘现状、续派未完成工作并推进当前阶段。遇到投标/不投标、重大风险、价格基准冻结、最终提交等人工门时必须停止等待用户。\n\n' + excerpt
  }
  return '【主对话未接续】用户已在本主会话提交指令，但主会话没有继续。请立刻处理这条指令，不要空等。\n\n' + excerpt
}
