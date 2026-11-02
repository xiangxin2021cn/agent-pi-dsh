import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getBusinessProject } from '../../../packages/business-projects/index.ts'
import { businessContextForAgent } from './business-activation.ts'
import { approvalStageFingerprint, loadBoard, projectForBoundSession } from './orchestration.ts'
import { assertModuleEnabled } from './modules.ts'
import { workflowFor } from './modules.ts'
import { captureTaskMandate } from './task-mandate.ts'
import { inspectLongTaskDispatchReceipt } from './long-task-dispatch.ts'
import { discoverLongTaskRecovery } from './long-task-recovery.ts'
import {
  listLongTasks, longTaskStatus, markLongTaskDispatchIntent, markLongTaskDispatched, markLongTaskToolEffect, pauseLongTask,
  reconcileLongTask, recordLongTaskUsage, recordLongTaskExternal, recoverLongTaskExternalAttempt, registerLongTaskChild, settleLongTaskAttempt,
  settleLongTaskChild, startLongTask, submitLongTaskChild, updateLongTaskLimits,
} from './long-task-runtime.ts'

/** Native events are receipts. The renderer observes this service and cannot invent them. */
export function registerLongTaskHost(ctx: any, createUserMessage: (input: any) => any, externalParentOf?: (carrier: unknown) => any) {
  const watched = new Map<string, { cwd: string; project: any }>()
  const recovered = new Set<string>()
  let ticking = false, disposed = false
  const busy = new Set<string>(), consumed = new Map<string, number>(), openTurns = new Map<string, number>()
  const noticeTurns = new Map<string, string | undefined>()
  const stepStarts = new Map<string, number>(), inboxes = new Map<string, any[]>(), calls = new Map<string, any>(), offers = new Map<string, any>()
  const externalCleanup = new Map<string, Promise<void>>()
  const getAgent = (id: string) => ctx.get('agents')?.get(id)
  const ownerOf = (agent: any) => businessContextForAgent(agent, ctx.get.bind(ctx))
  const sync = (cwd: string, project: any) => ctx.get('taskGuide')?.syncWorkbenchProject?.(cwd, project.projectId, project.module)
  const notify = (sessionId: string, status: any) => ctx.emit?.('agent-pi/long-task-changed', { sessionId, phase: status.phase })
  const offerKey = (cwd: string, project: any, sessionId: string, key: string) => `${resolve(cwd)}\n${project.module}\n${project.projectId}\n${sessionId}\n${key}`
  const active = (attempt: any) => attempt && ['dispatching', 'dispatched'].includes(attempt.status)
  const settlementNotice = (message: any) => message?.role === 'user' && message.source?.kind === 'subagent-settled' && message.source.form === 'notice'
  const externalNoticeAttempt = (message: any, run: any, parentSessionId: string) => settlementNotice(message)
    ? run?.attempts.find((row: any) => row.externalChildren?.[message.source.senderSessionId]?.parentSessionId === parentSessionId) : undefined
  const rememberNoticeTurn = (message: any, run: any, parentSessionId: string, turn: number) => {
    if (!settlementNotice(message)) return
    const key = `${parentSessionId}:${turn}`, attempt = externalNoticeAttempt(message, run, parentSessionId)
    // An unindexed native notice is still automatic input; this does not adopt its sender.
    if (attempt || !noticeTurns.has(key)) noticeTurns.set(key, attempt?.id)
  }
  const stopExternal = (cwd: string, project: any, sessionId: string, wave?: { attempts: Set<string>; selected: Set<string> }) => {
    if (externalCleanup.has(sessionId)) return
    const warn = () => {
      ctx.logger?.warn?.('外部子任务停止尚未确认；保留原收据，不会重复派发。')
    }
    try {
      const root = getAgent(sessionId), subagents = ctx.get('subagents')
      if (!root || !subagents?.interrupt || !subagents?.drainChildren) return
      const latest = longTaskStatus(cwd, project, sessionId), attempts = latest.run?.attempts || []
      const scope = wave || { attempts: new Set(attempts.filter(row => Object.values(row.externalChildren || {}).some(child => child.settledAt === undefined)).map(row => row.id)), selected: new Set<string>() }
      const children = attempts.filter(row => latest.run?.paused || latest.phase === 'blocked' || scope.attempts.has(row.id))
        .flatMap(row => Object.values(row.externalChildren || {})).filter(row => row.settledAt === undefined && !scope.selected.has(row.id))
      if (!children.length) return
      for (const child of children) scope.selected.add(child.id)
      // Reserve cleanup before any synchronous lifecycle callback can reenter it.
      const cleanup = Promise.resolve().then(async () => {
        for (const child of children) {
          try { subagents.interrupt(child.id, { kind: 'ancestor', agent: root }) } catch { warn() }
        }
        const results = await Promise.allSettled([...new Set(children.map(row => row.parentSessionId))].map(async id => {
          const parent = getAgent(id)
          if (!parent) throw new Error('外部执行的原父智能体尚未就绪，停止状态等待核对。')
          await subagents.drainChildren(parent, children.filter(row => row.parentSessionId === id).map(row => row.id))
        }))
        if (results.some(row => row.status === 'rejected')) warn()
        notify(sessionId, longTaskStatus(cwd, project, sessionId))
      }).catch(warn).finally(() => {
        externalCleanup.delete(sessionId)
        try {
          // Follow late children of the cancelled attempts, never a newly
          // authorized attempt; each child is tried at most once per wave.
          stopExternal(cwd, project, sessionId, scope)
        } catch { warn() }
      })
      externalCleanup.set(sessionId, cleanup)
    } catch { warn() }
  }
  const continuationBlocker = (sessionId: string) => {
    if (ctx.get('workspaceRegistry')?.archivedSessionIds?.includes(sessionId)) return '原主会话已归档，自动接续保持停止。'
    const task = ctx.get('taskGuide')?.read?.(sessionId)
    if (task?.control?.paused) return '用户已暂停共同任务，自动接续保持停止。'
    if (task?.pendingProjectSync) return '最新用户要求尚未同步，自动接续保持停止。'
    const native = ctx.get('nativeTaskExecutor')?.status?.(sessionId)
    if (native?.active || native?.pending) return '原任务已交给 Codex，DSH 不会并行派发。'
  }
  const captureContext = (project: any, sessionId: string, stageId: string, skillFiles?: Array<{ id: string; path: string; root: string }>) => {
    const agent = getAgent(sessionId), session = agent?.session || ctx.get('sessions')?.get(sessionId)
    const service = (name: string) => agent?.ctx?.get?.(name) ?? ctx.get(name)
    const sandbox = session && service('sandboxPolicy')?.resolve?.({ session })
    const preset = session && service('permissionPresets')?.current?.(session)
    const approval = service('approval')
    const approvalPolicy = session && (approval?.overrideOf?.(session) ?? approval?.config?.policy)
    return captureTaskMandate({ sessionId, task: ctx.get('taskGuide')?.read?.(sessionId),
      skillSlugs: skillFiles?.map(row => row.id) || workflowFor(project).stages.find(row => row.id === stageId)?.skillSlugs || [], skillFiles,
      ...(!sandbox && preset === undefined && approvalPolicy === undefined ? {} : { permissionPolicy: {
        version: 'agent-pi-continuation/v1', sandbox, preset, approval: approvalPolicy,
        tools: service('tools')?.schemas?.(agent).map((row: any) => row.name).sort() || [],
      } }),
    })
  }
  const contextFor = async (project: any, sessionId: string, stageId: string) => {
    const agent = getAgent(sessionId), session = agent?.session || ctx.get('sessions')?.get(sessionId)
    const slugs = workflowFor(project).stages.find(row => row.id === stageId)?.skillSlugs || []
    if (!slugs.length) return captureContext(project, sessionId, stageId, [])
    const skills = agent?.ctx?.get?.('skills') ?? ctx.get('skills')
    const catalog = await skills?.snapshot?.({ cwd: session?.header?.cwd, scope: agent })
    if (!catalog?.complete) throw new Error('接力所需技能目录尚未完整就绪，请稍后核对。')
    const files = slugs.map(id => {
      const skill = catalog.skills.find((row: any) => row.name === id)
      if (!skill?.path || skill.invocation?.modelInvocable !== true) throw new Error(`接力所需技能不可用：${id}`)
      return { id, path: skill.path, root: dirname(skill.path) }
    })
    return captureContext(project, sessionId, stageId, files)
  }
  const offeredContext = async (offer: any) => {
    const captured = await offer.context
    if (captured.error) throw new Error(captured.error)
    return captured.value
  }
  const freshProject = (cwd: string, project: any) => {
    const current = getBusinessProject(cwd, project.module, project.projectId)
    if (!current) throw new Error('原绑定项目已移除，宿主执行保持停止。')
    return current
  }
  function bound(cwd: string, project: any, sessionId: string) {
    const found = projectForBoundSession(cwd, sessionId)
    if (!found || found.projectId !== project.projectId || found.module !== project.module) throw new Error('执行恢复只能控制当前项目绑定的主会话。')
    const session = ctx.get('sessions')?.get(sessionId) || getAgent(sessionId)?.session
    if (session?.header?.origin === 'subagent') throw new Error('子任务不能控制主任务的执行范围或预算。')
  }
  function registerChild(cwd: string, project: any, sessionId: string, child: any, fromSeq?: number, newTurn = false) {
    const attempt = longTaskStatus(cwd, project, sessionId).attempt
    if (!newTurn && child.header?.createdAt < Date.parse(attempt?.createdAt || '')) return
    if (active(attempt) && !attempt!.children[child.id]) registerLongTaskChild(cwd, project, { sessionId, attemptId: attempt!.id, childSessionId: child.id, expectedPaths: [], fromSeq: fromSeq ?? child.inheritedEventCount ?? 0, observed: true })
  }
  function assignments(cwd: string, project: any, sessionId: string, rows: any[]) {
    bound(cwd, project, sessionId)
    const attempt = longTaskStatus(cwd, project, sessionId).attempt
    if (!active(attempt)) return
    for (const row of rows || []) {
      if (!row.childSessionId || !row.expectedOutput) continue
      const child = ctx.get('sessions')?.get(row.childSessionId) || getAgent(row.childSessionId)?.session
      const owner = child && ownerOf({ session: child })
      if (!owner || owner.sessionId !== sessionId || owner.project.projectId !== project.projectId || owner.project.module !== project.module) throw new Error('子任务输出范围不能绑定无关会话。')
      registerLongTaskChild(cwd, project, { sessionId, attemptId: attempt!.id, childSessionId: child.id, expectedPaths: [row.expectedOutput], fromSeq: child.seq })
    }
  }
  function observe(session: any, event: any, suppliedOwner?: any, replaying = false) {
    const owner = suppliedOwner || ownerOf({ session })
    if (!owner) return
    const { cwd, project, sessionId } = owner, status = longTaskStatus(cwd, project, sessionId), run = status.run
    if (!run || !Number.isFinite(event.time) || event.time < Date.parse(run.createdAt) || event.seq < (session.inheritedEventCount || 0) || session.id === sessionId && event.seq < (run.fromSeq || 0)) return
    if (!replaying && session.id !== sessionId && event.type === 'turn/start') registerChild(cwd, project, sessionId, session, event.seq, true)
    const latest = longTaskStatus(cwd, project, sessionId).run!
    const turn = event.data?.turn ?? openTurns.get(session.id)
    const attempt = session.id === sessionId ? latest.attempts.find(row => row.messageId && turn !== undefined && consumed.get(row.messageId) === turn || row.id === noticeTurns.get(`${session.id}:${turn}`)) || status.attempt
      : [...latest.attempts].reverse().find(row => row.children[session.id] && event.seq >= (row.children[session.id]!.fromSeq || 0))
    if (event.type === 'subagent/catalog' && event.data?.version === 2 && event.data.mode === 'external' && attempt) {
      const owned = latest.attempts.find(row => row.externalChildren?.[event.data.childId]) || attempt
      recoverLongTaskExternalAttempt(cwd, project, { sessionId, attemptId: owned.id, parentSessionId: session.id, snapshot: { session: { id: session.id }, inheritedEventCount: session.inheritedEventCount, events: [event] } })
    }
    if (event.type === 'user/message' || event.type === 'agent/inbox/spliced') {
      const messages = event.type === 'user/message' ? [event.data] : event.data?.inserted || []
      const owners = latest.attempts.filter(row => messages.some((message: any) => externalNoticeAttempt(message, { attempts: [row] }, session.id)))
      for (const owned of owners) recoverLongTaskExternalAttempt(cwd, project, { sessionId, attemptId: owned.id, parentSessionId: session.id, snapshot: { session: { id: session.id }, inheritedEventCount: session.inheritedEventCount, events: [event] } })
    }
    if (!attempt) return
    const stepKey = `${session.id}:${event.data?.turn}:${event.data?.step}`, callKey = `${session.id}:${event.data?.callId || event.data?.message?.toolCallId}`
    if (event.type === 'turn/start') openTurns.set(session.id, event.data.turn)
    if (event.type === 'agent/inbox/spliced') {
      const key = `${session.id}:${event.data.target}`, queue = inboxes.get(key) || []
      const removed = queue.splice(event.data.start, event.data.removedCount || 0, ...(event.data.inserted || []))
      inboxes.set(key, queue)
      for (const message of removed) {
        const original = latest.attempts.some(row => row.messageId === message.id), external = externalNoticeAttempt(message, latest, session.id)
        if (event.data.outcome === 'canceled' && (original || external)) pauseLongTask(cwd, project, sessionId, true)
        else if (openTurns.has(session.id)) {
          if (original) consumed.set(message.id, openTurns.get(session.id)!)
          rememberNoticeTurn(message, latest, session.id, openTurns.get(session.id)!)
        }
      }
    }
    if (event.type === 'user/message' && latest.attempts.some(row => row.messageId === event.data.id) && openTurns.has(session.id)) consumed.set(event.data.id, openTurns.get(session.id)!)
    if (event.type === 'user/message' && openTurns.has(session.id)) {
      rememberNoticeTurn(event.data, latest, session.id, openTurns.get(session.id)!)
    }
    if (event.type === 'step/start') stepStarts.set(stepKey, event.time)
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      const usage = event.data.usage || [...(event.data.stream || [])].reverse().find((row: any) => row.type === 'chunk' && row.chunk?.type === 'usage')?.chunk.usage
      recordLongTaskUsage(cwd, project, { sessionId, sourceSessionId: session.id, eventId: String(event.seq), usage,
        elapsedMs: stepStarts.has(stepKey) ? Math.max(0, event.time - stepStarts.get(stepKey)!) : undefined })
      stepStarts.set(stepKey, event.time)
    }
    if (event.type === 'tool/call') {
      calls.set(callKey, event.data)
      if (!['read', 'read_image', 'glob', 'grep', 'write', 'edit'].includes(event.data.name)) markLongTaskToolEffect(cwd, project, { sessionId, attemptId: attempt.id, callId: callKey, resolved: false })
    }
    if (event.type === 'tool/result') {
      const call = calls.get(callKey)
      if (!event.data.message?.isError) {
        markLongTaskToolEffect(cwd, project, { sessionId, attemptId: attempt.id, callId: callKey, resolved: true })
        if (session.id === sessionId && call?.name === 'tender_stage') {
          const args = JSON.parse(call.arguments)
          if (args.action === 'execution_update' && Array.isArray(args.assignments)) assignments(cwd, project, sessionId, args.assignments)
        }
      }
      calls.delete(callKey)
    }
    if (event.type === 'turn/end') {
      if (session.id === sessionId) {
        const finished = latest.attempts.find(row => row.messageId && consumed.get(row.messageId) === event.data.turn)
        if (finished) {
          settleLongTaskAttempt(cwd, project, { sessionId, attemptId: finished.id })
          if (finished.id === latest.currentAttemptId && event.data.reason?.kind !== 'completed') pauseLongTask(cwd, project, sessionId, true)
          consumed.delete(finished.messageId!)
        }
      } else {
        const child = attempt.children[session.id]!
        if (child.expectedPaths.length) {
          try {
            const artifacts = child.expectedPaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }))
            const skillFiles = attempt.context?.skills.map(row => ({ id: row.id, path: row.sourcePath, root: dirname(row.sourcePath) }))
            submitLongTaskChild(cwd, project, { sessionId, attemptId: attempt.id, childSessionId: session.id, submissionId: `${session.id}:${event.seq}`, inputFingerprint: attempt.inputFingerprint, artifacts, context: captureContext(project, sessionId, attempt.stageId, skillFiles) })
          } catch { /* An absent file remains a gap. */ }
        }
        settleLongTaskChild(cwd, project, { sessionId, attemptId: attempt.id, childSessionId: session.id, reason: event.data.reason?.kind })
      }
      openTurns.delete(session.id)
      noticeTurns.delete(`${session.id}:${event.data.turn}`)
    }
    const next = longTaskStatus(cwd, project, sessionId)
    if (next.run?.paused || next.phase === 'blocked') stopExternal(cwd, project, sessionId)
    watched.set(sessionId, { cwd, project }); notify(sessionId, next)
  }
  async function replay(cwd: string, project: any, sessionId: string) {
    project = freshProject(cwd, project)
    const run = longTaskStatus(cwd, project, sessionId).run, query = ctx.get('sessionQuery')
    if (!run || !query?.readSession) return
    const ids = [sessionId, ...new Set(run.attempts.flatMap(row => Object.keys(row.children)))]
    for (const id of ids) {
      const live = ctx.get('sessions')?.get(id)
      if (live && await ctx.get('sessions')?.flush?.(live) !== true) throw new Error('会话持久化尚未确认，保留待核对状态。')
      const snapshot = await query.readSession(id)
      if (id === sessionId && resolve(snapshot.session.cwd) !== resolve(cwd)) throw new Error('恢复会话的工作区不匹配。')
      const pending = longTaskStatus(cwd, project, sessionId).attempt
      const receipt = id === sessionId && pending ? inspectLongTaskDispatchReceipt(cwd, sessionId, pending, snapshot) : undefined
      openTurns.delete(id)
      for (const key of noticeTurns.keys()) if (key.startsWith(`${id}:`)) noticeTurns.delete(key)
      for (const key of inboxes.keys()) if (key.startsWith(`${id}:`)) inboxes.delete(key)
      for (const event of snapshot.events) observe({ id, header: snapshot.session, inheritedEventCount: snapshot.inheritedEventCount }, event, { cwd, project, sessionId }, true)
      const current = longTaskStatus(cwd, project, sessionId).attempt
      if (id === sessionId && current?.status === 'dispatching' && receipt?.state === 'found') markLongTaskDispatched(cwd, project, { sessionId, attemptId: current.id, key: current.key, messageId: receipt.messageId, context: current.context })
    }
  }
  async function send(cwd: string, project: any, sessionId: string, status: any) {
    if (disposed) throw new Error('原执行宿主已停止，未派发任务。')
    const agent = getAgent(sessionId)
    if (!agent || agent.status !== 'idle' || agent.inbox?.hasPending) throw new Error('主会话仍有执行或待处理消息；宿主不会重复派工。')
    const attempt = status.attempt
    if (status.phase !== 'ready' || !attempt || attempt.status !== 'prepared') return status
    const context = await contextFor(project, sessionId, attempt.stageId)
    if (await ctx.get('sessions')?.flush?.(agent.session) !== true) throw new Error('原生会话持久化不可用，未派发执行。')
    const blocked = continuationBlocker(sessionId)
    if (blocked) throw new Error(blocked)
    if (disposed) throw new Error('原执行宿主已停止，未派发任务。')
    if (agent.status !== 'idle' || agent.inbox?.hasPending) throw new Error('原主会话已收到新输入或仍在执行，未重复派发。')
    const latest = captureContext(project, sessionId, attempt.stageId, context.skills.map(row => ({ id: row.id, path: row.sourcePath, root: dirname(row.sourcePath) })))
    if (latest.fingerprint !== context.fingerprint) throw new Error('派发前接力来源或权限已变化，请核对后继续。')
    const message = createUserMessage({ content: [{ type: 'text', text: attempt.draft }], source: { kind: 'plugin:tender-host', form: 'instructions' } })
    ctx.get('taskGuide')?.registerControlPrompt?.(sessionId, attempt.draft)
    markLongTaskDispatchIntent(cwd, project, { sessionId, attemptId: attempt.id, key: attempt.key, messageId: message.id, context })
    agent.followup(message)
    if (await ctx.get('sessions')?.flush?.(agent.session) !== true) throw new Error('派发后的持久化未确认，保留原消息意图等待核对。')
    markLongTaskDispatched(cwd, project, { sessionId, attemptId: attempt.id, key: attempt.key, messageId: message.id, context })
    watched.set(sessionId, { cwd, project }); sync(cwd, project)
    const next = longTaskStatus(cwd, project, sessionId); notify(sessionId, next); return next
  }
  const service = {
    list: listLongTasks,
    offer(cwd: string, project: any, sessionId: string, input: { draft: string; dispatch: { stageId: string; key: string } }) {
      project = freshProject(cwd, project)
      bound(cwd, project, sessionId)
      if (!input.draft || !input.dispatch?.key) return
      for (const [key, row] of offers) if (row.expires < Date.now()) offers.delete(key)
      const baseline = captureContext(project, sessionId, input.dispatch.stageId, [])
      const selection = (value: typeof baseline) => JSON.stringify({ task: value.taskSha256, policy: value.policySha256, knowledge: value.knowledge, templates: value.templates })
      const context = contextFor(project, sessionId, input.dispatch.stageId).then(value => {
        if (selection(value) !== selection(baseline)) throw new Error('阶段预览期间知识、范本或用户约束已变化，请重新准备当前阶段。')
        return { value }
      }).catch(error => ({ error: String(error.message || error) }))
      offers.set(offerKey(cwd, project, sessionId, input.dispatch.key), { ...input, fingerprint: approvalStageFingerprint(cwd, project, input.dispatch.stageId), context, expires: Date.now() + 90_000 })
    },
    async prepared(cwd: string, project: any, sessionId: string, input: { stageId: string; key: string }) {
      project = freshProject(cwd, project)
      bound(cwd, project, sessionId); assertModuleEnabled(project.module)
      if (busy.has(sessionId)) throw new Error('本会话已有宿主派发事务。')
      const wasPaused = longTaskStatus(cwd, project, sessionId).run?.paused
      busy.add(sessionId)
      try {
        if (wasPaused) pauseLongTask(cwd, project, sessionId, false)
        const status = await service.status(cwd, project, sessionId)
        if (status.phase === 'ready' && status.attempt?.status === 'prepared' && status.attempt.stageId === input.stageId) return { draft: status.attempt.draft, dispatch: { stageId: status.attempt.stageId, key: status.attempt.key } }
        const attempt = status.attempt
        if (status.run && (attempt?.messageId && !attempt.settledAt || attempt?.externalEffectsUnknown || attempt?.pendingToolCalls?.length || Object.values(attempt?.children || {}).some((child: any) => !child.settledAt) || ['dispatching', 'dispatched'].includes(attempt?.status || '') || ['blocked', 'waiting'].includes(status.phase))) throw new Error(status.reason || '上一尝试尚未核对结算，不能重复执行。')
        const offer = offers.get(offerKey(cwd, project, sessionId, input.key))
        if (!offer || offer.expires < Date.now() || offer.dispatch.stageId !== input.stageId || offer.fingerprint !== approvalStageFingerprint(cwd, project, input.stageId) || (await offeredContext(offer)).fingerprint !== (await contextFor(project, sessionId, input.stageId)).fingerprint) throw new Error(status.phase === 'needs_review' ? status.reason : '阶段预览已过期或未由宿主登记，请读取最新工作台后继续。')
        if (!status.run && loadBoard(cwd, project.projectId, project.module).stages[input.stageId]?.dispatch?.dispatchedAt) throw new Error('旧派发缺少宿主结算收据，请先核对原执行结果。')
        return { draft: offer.draft, dispatch: { ...offer.dispatch } }
      } finally {
        try { if (wasPaused) pauseLongTask(cwd, project, sessionId, true) } finally { busy.delete(sessionId) }
      }
    },
    setLimits(cwd: string, project: any, sessionId: string, limits: unknown) {
      project = freshProject(cwd, project)
      bound(cwd, project, sessionId); assertModuleEnabled(project.module)
      return updateLongTaskLimits(cwd, project, sessionId, limits)
    },
    registerAssignments: assignments,
    async status(cwd: string, project: any, sessionId: string) {
      project = freshProject(cwd, project)
      bound(cwd, project, sessionId)
      await replay(cwd, project, sessionId)
      const agent = getAgent(sessionId), status = longTaskStatus(cwd, project, sessionId)
      if (!status.run) return status
      const context = await contextFor(project, sessionId, status.run.stageId)
      const checked = reconcileLongTask(cwd, project, { sessionId, parentState: agent?.status === 'running' || agent?.inbox?.hasPending ? 'running' : agent?.status === 'idle' ? 'idle' : 'unknown', childrenState: Object.fromEntries(Object.keys(status.attempt?.children || {}).map(id => [id, getAgent(id)?.status === 'running' ? 'running' : getAgent(id)?.status === 'idle' ? 'idle' : 'unknown'])), context })
      return checked.phase === 'waiting' && agent?.status === 'idle' && agent?.inbox?.hasPending ? { ...checked, reason: '原主会话已有待处理输入，等待执行器继续；已保留原消息，未重复插入。' } : checked
    },
    async dispatch(cwd: string, project: any, input: any) {
      project = freshProject(cwd, project)
      bound(cwd, project, input.sessionId); assertModuleEnabled(project.module)
      if (busy.has(input.sessionId)) throw new Error('本会话已有宿主派发事务。')
      busy.add(input.sessionId)
      try {
        const agent = getAgent(input.sessionId)
        if (!agent || agent.status !== 'idle' || agent.inbox?.hasPending) throw new Error('请先等待主会话空闲，再继续当前阶段。')
        if (input.limits !== undefined) updateLongTaskLimits(cwd, project, input.sessionId, input.limits)
        const previous = await service.status(cwd, project, input.sessionId)
        if (previous.run?.paused) throw new Error('暂停状态仍有效，请先恢复本项目。')
        let status = previous
        if (!(previous.phase === 'ready' && (!input.stageId || previous.attempt?.stageId === input.stageId) && (!input.key || previous.attempt?.key === input.key))) {
          const offer = offers.get(offerKey(cwd, project, input.sessionId, input.key))
          if (!offer || offer.expires < Date.now() || offer.dispatch.stageId !== input.stageId || offer.fingerprint !== approvalStageFingerprint(cwd, project, input.stageId)) throw new Error('阶段预览已过期或未由宿主登记，请读取最新工作台后继续。')
          const context = await offeredContext(offer)
          if (context.fingerprint !== (await contextFor(project, input.sessionId, input.stageId)).fingerprint) throw new Error('阶段预览的知识、范本、技能或权限已变化，请重新准备当前阶段。')
          if (!previous.run && loadBoard(cwd, project.projectId, project.module).stages[input.stageId]?.dispatch?.dispatchedAt) throw new Error('旧派发缺少宿主结算收据，请先核对原执行结果。')
          status = startLongTask(cwd, project, { sessionId: input.sessionId, stageId: offer.dispatch.stageId, key: offer.dispatch.key, draft: offer.draft, limits: input.limits, fromSeq: agent.session.seq, context })
        }
        return await send(cwd, project, input.sessionId, status)
      } finally { busy.delete(input.sessionId) }
    },
    pause(cwd: string, project: any, sessionId: string, paused = true) {
      bound(cwd, project, sessionId)
      const status = pauseLongTask(cwd, project, sessionId, paused)
      if (paused) stopExternal(cwd, project, sessionId)
      watched.set(sessionId, { cwd, project }); notify(sessionId, status); return status
    },
  }
  ctx.provide('longTaskRuntime', service)
  const externalLifecycle = (type: 'subagent/start' | 'subagent/end', carrier: unknown, info: any) => {
    if (info.local || !externalParentOf) return
    const parent = externalParentOf(carrier)
    if (!parent || getAgent(parent.id) !== parent) return
    const owner = ownerOf(parent)
    if (!owner) return
    const { cwd, project, sessionId } = owner, status = longTaskStatus(cwd, project, sessionId)
    const registered = status.run?.attempts.find(row => row.externalChildren?.[info.id])
    if (type === 'subagent/end' && !registered) return
    const attempt = registered
      || (parent.id === sessionId ? status.attempt : [...(status.run?.attempts || [])].reverse().find(row => row.children[parent.id]))
    if (!attempt || type === 'subagent/start' && !attempt.externalChildren?.[info.id] && !active(attempt)) return
    const next = recordLongTaskExternal(cwd, project, { sessionId, attemptId: attempt.id, parentSessionId: parent.id, event: { type, info, observedAt: Date.now() } })
    watched.set(sessionId, { cwd, project }); notify(sessionId, next)
    if (next.run?.paused || next.phase === 'blocked') stopExternal(cwd, project, sessionId)
  }
  ctx.on('subagent/start', function (this: unknown, info: any) { externalLifecycle('subagent/start', this, info) })
  ctx.on('subagent/end', function (this: unknown, info: any) { externalLifecycle('subagent/end', this, info) })
  ctx.on('session/event', (session: any, event: any) => observe(session, event))
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }: any) => {
    const owner = ownerOf(agent)
    if (!owner) return
    const run = longTaskStatus(owner.cwd, owner.project, owner.sessionId).run
    if (run?.attempts.some(row => row.messageId === message.id)) consumed.set(message.id, turn)
    rememberNoticeTurn(message, run, agent.session.id, turn)
  })
  const created = ({ agent }: any) => {
    const owner = ownerOf(agent)
    if (!owner) return
    const { cwd, project, sessionId } = owner
    if (!longTaskStatus(cwd, project, sessionId).run) return
    if (agent.session.id !== sessionId) registerChild(cwd, project, sessionId, agent.session)
    watched.set(sessionId, { cwd, project })
  }
  ctx.on('agent/created', created)
  for (const agent of ctx.get('agents')?.list?.() || []) created({ agent })
  ctx.on('agent/pre-step', async (payload: any, next: any) => {
    const owner = ownerOf(payload.agent)
    if (owner) {
      const status = longTaskStatus(owner.cwd, owner.project, owner.sessionId)
      const turnKey = `${payload.agent.session.id}:${payload.turn}`
      for (const message of payload.messages || []) rememberNoticeTurn(message, status.run, payload.agent.session.id, payload.turn)
      const runtimeTurn = payload.agent.session.id !== owner.sessionId || noticeTurns.has(turnKey) || status.run?.attempts.some(row => row.messageId && (consumed.get(row.messageId) === payload.turn || payload.messages?.some((message: any) => message.id === row.messageId)))
      // Human corrections remain admissible while the automatic task is paused.
      if (runtimeTurn && status.run && ['paused', 'blocked'].includes(status.phase)) { stopExternal(owner.cwd, owner.project, owner.sessionId); return { kind: 'reject' } }
      if (runtimeTurn && status.attempt) {
        try {
          const blocked = continuationBlocker(owner.sessionId)
          if (blocked) {
            pauseLongTask(owner.cwd, owner.project, owner.sessionId, true, blocked)
            stopExternal(owner.cwd, owner.project, owner.sessionId)
            return { kind: 'reject' }
          }
          const context = await contextFor(owner.project, owner.sessionId, status.attempt.stageId)
          const latest = longTaskStatus(owner.cwd, owner.project, owner.sessionId), changedBlocker = continuationBlocker(owner.sessionId)
          if (['paused', 'blocked'].includes(latest.phase)) { stopExternal(owner.cwd, owner.project, owner.sessionId); return { kind: 'reject' } }
          if (changedBlocker) {
            pauseLongTask(owner.cwd, owner.project, owner.sessionId, true, changedBlocker)
            stopExternal(owner.cwd, owner.project, owner.sessionId)
            return { kind: 'reject' }
          }
          if (latest.attempt?.id !== status.attempt.id || latest.attempt?.context?.fingerprint !== context.fingerprint) {
            pauseLongTask(owner.cwd, owner.project, owner.sessionId, true, '知识库、范本、技能、权限或用户约束已变化，自动接续已暂停，请核对当前版本后继续。')
            stopExternal(owner.cwd, owner.project, owner.sessionId)
            notify(owner.sessionId, { phase: 'needs_review' })
            return { kind: 'reject' }
          }
        } catch {
          pauseLongTask(owner.cwd, owner.project, owner.sessionId, true, '接力来源或权限快照暂不能核验，自动接续已暂停，请核对后继续。')
          stopExternal(owner.cwd, owner.project, owner.sessionId)
          notify(owner.sessionId, { phase: 'needs_review' })
          return { kind: 'reject' }
        }
      }
    }
    return next()
  })
  const recoverRegistered = async () => {
    const registry = ctx.get('workspaceRegistry'), controller = ctx.get('sessionController')
    if (!registry?.list || !controller?.resolveAgent) return
    const candidates = discoverLongTaskRecovery(registry, {
      projectForBoundSession, listLongTasks, status: longTaskStatus,
      hasRecoveryContext: (run, attempt) => !!attempt.context && attempt.context.rootSessionId === run.sessionId,
      reportError: () => ctx.logger?.warn?.('一项登记项目的接力状态不能核验，已保留原数据等待核对。'),
    })
    let loaded = 0
    for (const { cwd, project, sessionId } of candidates) {
      const identity = `${resolve(cwd)}\n${sessionId}`
      if (recovered.has(identity)) continue
      if (!getAgent(sessionId) && loaded >= 2) continue
      recovered.add(identity)
      try {
        assertModuleEnabled(project.module)
        if (continuationBlocker(sessionId)) continue
        if (!getAgent(sessionId)) {
          loaded++
          const snapshot = await ctx.get('sessionQuery')?.readSession?.(sessionId)
          if (!snapshot || snapshot.session.id !== sessionId || resolve(snapshot.session.cwd) !== resolve(cwd) || snapshot.session.origin === 'subagent') throw new Error('原主会话或工作区不能核验。')
          const resolved = await controller.resolveAgent(sessionId)
          if (!resolved?.agent || resolved.error) throw new Error('原主会话尚不能恢复。')
        }
        bound(cwd, project, sessionId)
        watched.set(sessionId, { cwd, project })
        await service.status(cwd, project, sessionId)
      } catch {
        ctx.logger?.warn?.('原主会话恢复等待核对；没有新建会话或重复派发。')
      }
    }
  }
  const tick = async () => {
    if (ticking || disposed) return
    ticking = true
    try {
      await recoverRegistered()
    for (const [sessionId, { cwd, project }] of watched) {
      if (busy.has(sessionId)) continue
      busy.add(sessionId)
      try {
        const observed = longTaskStatus(cwd, project, sessionId)
        if (observed.run?.paused || observed.phase === 'blocked') stopExternal(cwd, project, sessionId)
        if (getAgent(sessionId)?.status !== 'idle' || getAgent(sessionId)?.inbox?.hasPending) continue
        const blocked = continuationBlocker(sessionId)
        if (blocked) { pauseLongTask(cwd, project, sessionId, true, blocked); stopExternal(cwd, project, sessionId); watched.delete(sessionId); continue }
        const current = freshProject(cwd, project), status = await service.status(cwd, current, sessionId)
        if (['paused', 'blocked', 'needs_review'].includes(status.phase)) stopExternal(cwd, current, sessionId)
        sync(cwd, current); notify(sessionId, status)
        if (status.phase === 'ready' && !status.run?.paused) await send(cwd, current, sessionId, status)
        else if (['done', 'blocked', 'needs_review', 'inactive'].includes(status.phase)) watched.delete(sessionId)
      } catch (error) { ctx.logger?.warn?.('长期任务恢复等待核对：' + String(error)); watched.delete(sessionId) }
      finally { busy.delete(sessionId) }
    }
    } catch { ctx.logger?.warn?.('登记工作区的接力恢复暂不可用，已保留原会话等待核对。') }
    finally { ticking = false }
  }
  ctx.effect(() => { const timer = setInterval(() => { void tick() }, 15000); timer.unref?.(); return () => { disposed = true; clearInterval(timer) } })
  return service
}
