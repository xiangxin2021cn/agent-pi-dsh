import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getBusinessProject } from '../../../packages/business-projects/index.ts'
import { businessContextForAgent } from './business-activation.ts'
import { approvalStageFingerprint, loadBoard, projectForBoundSession } from './orchestration.ts'
import { assertModuleEnabled } from './modules.ts'
import {
  listLongTasks, longTaskStatus, markLongTaskDispatchIntent, markLongTaskDispatched, markLongTaskToolEffect, pauseLongTask,
  reconcileLongTask, recordLongTaskUsage, registerLongTaskChild, settleLongTaskAttempt,
  settleLongTaskChild, startLongTask, submitLongTaskChild,
} from './long-task-runtime.ts'

/** Native events are receipts. The renderer observes this service and cannot invent them. */
export function registerLongTaskHost(ctx: any, createUserMessage: (input: any) => any) {
  const watched = new Map<string, { cwd: string; project: any }>()
  const busy = new Set<string>(), consumed = new Map<string, number>(), openTurns = new Map<string, number>()
  const stepStarts = new Map<string, number>(), inboxes = new Map<string, any[]>(), calls = new Map<string, any>(), offers = new Map<string, any>()
  const getAgent = (id: string) => ctx.get('agents')?.get(id)
  const ownerOf = (agent: any) => businessContextForAgent(agent, ctx.get.bind(ctx))
  const sync = (cwd: string, project: any) => ctx.get('taskGuide')?.syncWorkbenchProject?.(cwd, project.projectId, project.module)
  const notify = (sessionId: string, status: any) => ctx.emit?.('agent-pi/long-task-changed', { sessionId, phase: status.phase })
  const offerKey = (cwd: string, project: any, sessionId: string, key: string) => `${resolve(cwd)}\n${project.module}\n${project.projectId}\n${sessionId}\n${key}`
  const active = (attempt: any) => attempt && ['dispatching', 'dispatched'].includes(attempt.status)
  const freshProject = (cwd: string, project: any) => {
    const current = getBusinessProject(cwd, project.module, project.projectId)
    if (!current) throw new Error('原绑定项目已移除，宿主执行保持停止。')
    return current
  }
  function bound(cwd: string, project: any, sessionId: string) {
    const found = projectForBoundSession(cwd, sessionId)
    if (!found || found.projectId !== project.projectId || found.module !== project.module) throw new Error('执行恢复只能控制当前项目绑定的主会话。')
    const session = ctx.get('sessions')?.get(sessionId) || getAgent(sessionId)?.session
    if (session?.header?.parentSession) throw new Error('子任务不能控制主任务的执行范围或预算。')
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
    const attempt = session.id === sessionId ? latest.attempts.find(row => row.messageId && consumed.get(row.messageId) === event.data?.turn) || status.attempt
      : [...latest.attempts].reverse().find(row => row.children[session.id] && event.seq >= (row.children[session.id]!.fromSeq || 0))
    if (!attempt) return
    const stepKey = `${session.id}:${event.data?.turn}:${event.data?.step}`, callKey = `${session.id}:${event.data?.callId || event.data?.message?.toolCallId}`
    if (event.type === 'turn/start') openTurns.set(session.id, event.data.turn)
    if (event.type === 'agent/inbox/spliced') {
      const key = `${session.id}:${event.data.target}`, queue = inboxes.get(key) || []
      const removed = queue.splice(event.data.start, event.data.removedCount || 0, ...(event.data.inserted || []))
      inboxes.set(key, queue)
      for (const message of removed) if (latest.attempts.some(row => row.messageId === message.id)) {
        if (event.data.outcome === 'canceled') pauseLongTask(cwd, project, sessionId, true)
        else if (openTurns.has(session.id)) consumed.set(message.id, openTurns.get(session.id)!)
      }
    }
    if (event.type === 'user/message' && latest.attempts.some(row => row.messageId === event.data.id) && openTurns.has(session.id)) consumed.set(event.data.id, openTurns.get(session.id)!)
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
            submitLongTaskChild(cwd, project, { sessionId, attemptId: attempt.id, childSessionId: session.id, submissionId: `${session.id}:${event.seq}`, inputFingerprint: attempt.inputFingerprint, artifacts })
          } catch { /* An absent file remains a gap. */ }
        }
        settleLongTaskChild(cwd, project, { sessionId, attemptId: attempt.id, childSessionId: session.id, reason: event.data.reason?.kind })
      }
      openTurns.delete(session.id)
    }
    watched.set(sessionId, { cwd, project }); notify(sessionId, longTaskStatus(cwd, project, sessionId))
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
      openTurns.delete(id)
      for (const key of inboxes.keys()) if (key.startsWith(`${id}:`)) inboxes.delete(key)
      for (const event of snapshot.events) observe({ id, header: snapshot.session, inheritedEventCount: snapshot.inheritedEventCount }, event, { cwd, project, sessionId }, true)
      const current = longTaskStatus(cwd, project, sessionId).attempt
      if (id === sessionId && current?.status === 'dispatching' && snapshot.events.some((event: any) => event.type === 'user/message' && event.data.id === current.messageId || event.type === 'agent/inbox/spliced' && event.data.inserted?.some((row: any) => row.id === current.messageId))) markLongTaskDispatched(cwd, project, { sessionId, attemptId: current.id, key: current.key, messageId: current.messageId! })
    }
  }
  async function send(cwd: string, project: any, sessionId: string, status: any) {
    const agent = getAgent(sessionId)
    if (!agent || agent.status !== 'idle' || agent.inbox?.hasPending) throw new Error('主会话仍有执行或待处理消息；宿主不会重复派工。')
    const attempt = status.attempt
    if (status.phase !== 'ready' || !attempt || attempt.status !== 'prepared') return status
    if (await ctx.get('sessions')?.flush?.(agent.session) !== true) throw new Error('原生会话持久化不可用，未派发执行。')
    const message = createUserMessage({ content: [{ type: 'text', text: attempt.draft }], source: { kind: 'plugin:tender-host', form: 'instructions' } })
    ctx.get('taskGuide')?.registerControlPrompt?.(sessionId, attempt.draft)
    markLongTaskDispatchIntent(cwd, project, { sessionId, attemptId: attempt.id, key: attempt.key, messageId: message.id })
    agent.followup(message)
    if (await ctx.get('sessions')?.flush?.(agent.session) !== true) throw new Error('派发后的持久化未确认，保留原消息意图等待核对。')
    markLongTaskDispatched(cwd, project, { sessionId, attemptId: attempt.id, key: attempt.key, messageId: message.id })
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
      offers.set(offerKey(cwd, project, sessionId, input.dispatch.key), { ...input, fingerprint: approvalStageFingerprint(cwd, project, input.dispatch.stageId), expires: Date.now() + 90_000 })
    },
    registerAssignments: assignments,
    async status(cwd: string, project: any, sessionId: string) {
      project = freshProject(cwd, project)
      bound(cwd, project, sessionId)
      await replay(cwd, project, sessionId)
      const agent = getAgent(sessionId), status = longTaskStatus(cwd, project, sessionId)
      if (!status.run || agent?.status === 'running' || agent?.inbox?.hasPending) return status
      return reconcileLongTask(cwd, project, { sessionId, parentState: agent?.status === 'idle' ? 'idle' : 'unknown', childrenState: Object.fromEntries(Object.keys(status.attempt?.children || {}).map(id => [id, getAgent(id)?.status === 'running' ? 'running' : getAgent(id)?.status === 'idle' ? 'idle' : 'unknown'])) })
    },
    async dispatch(cwd: string, project: any, input: any) {
      project = freshProject(cwd, project)
      bound(cwd, project, input.sessionId); assertModuleEnabled(project.module)
      if (busy.has(input.sessionId)) throw new Error('本会话已有宿主派发事务。')
      busy.add(input.sessionId)
      try {
        const agent = getAgent(input.sessionId)
        if (!agent || agent.status !== 'idle' || agent.inbox?.hasPending) throw new Error('请先等待主会话空闲，再继续当前阶段。')
        const previous = await service.status(cwd, project, input.sessionId)
        if (previous.run?.paused) throw new Error('暂停状态仍有效，请先恢复本项目。')
        let status = previous
        if (!(previous.phase === 'ready' && (!input.stageId || previous.attempt?.stageId === input.stageId) && (!input.key || previous.attempt?.key === input.key))) {
          const offer = offers.get(offerKey(cwd, project, input.sessionId, input.key))
          if (!offer || offer.expires < Date.now() || offer.dispatch.stageId !== input.stageId || offer.fingerprint !== approvalStageFingerprint(cwd, project, input.stageId)) throw new Error('阶段预览已过期或未由宿主登记，请读取最新工作台后继续。')
          if (!previous.run && loadBoard(cwd, project.projectId, project.module).stages[input.stageId]?.dispatch?.dispatchedAt) throw new Error('旧派发缺少宿主结算收据，请先核对原执行结果。')
          status = startLongTask(cwd, project, { sessionId: input.sessionId, stageId: offer.dispatch.stageId, key: offer.dispatch.key, draft: offer.draft, limits: input.limits, fromSeq: agent.session.seq })
        }
        return await send(cwd, project, input.sessionId, status)
      } finally { busy.delete(input.sessionId) }
    },
    pause(cwd: string, project: any, sessionId: string, paused = true) {
      bound(cwd, project, sessionId)
      const status = pauseLongTask(cwd, project, sessionId, paused)
      watched.set(sessionId, { cwd, project }); notify(sessionId, status); return status
    },
  }
  ctx.provide('longTaskRuntime', service)
  ctx.on('session/event', (session: any, event: any) => observe(session, event))
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }: any) => {
    const owner = ownerOf(agent)
    if (owner && longTaskStatus(owner.cwd, owner.project, owner.sessionId).run?.attempts.some(row => row.messageId === message.id)) consumed.set(message.id, turn)
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
      const runtimeTurn = payload.agent.session.id !== owner.sessionId || status.run?.attempts.some(row => row.messageId && (consumed.get(row.messageId) === payload.turn || payload.messages?.some((message: any) => message.id === row.messageId)))
      // Human corrections remain admissible while the automatic task is paused.
      if (runtimeTurn && status.run && ['paused', 'blocked'].includes(status.phase)) return { kind: 'reject' }
    }
    return next()
  })
  const tick = async () => {
    for (const [sessionId, { cwd, project }] of watched) {
      if (busy.has(sessionId) || getAgent(sessionId)?.status !== 'idle' || getAgent(sessionId)?.inbox?.hasPending) continue
      busy.add(sessionId)
      try {
        const current = freshProject(cwd, project), status = await service.status(cwd, current, sessionId)
        sync(cwd, current); notify(sessionId, status)
        if (status.phase === 'ready' && !status.run?.paused) await send(cwd, current, sessionId, status)
        else if (['done', 'blocked', 'needs_review', 'inactive'].includes(status.phase)) watched.delete(sessionId)
      } catch (error) { ctx.logger?.warn?.('长期任务恢复等待核对：' + String(error)); watched.delete(sessionId) }
      finally { busy.delete(sessionId) }
    }
  }
  ctx.effect(() => { const timer = setInterval(() => { void tick() }, 15000); timer.unref?.(); return () => clearInterval(timer) })
  return service
}
