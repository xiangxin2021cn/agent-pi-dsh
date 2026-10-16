import type { ProfessionalTask, TaskInteraction, TaskInteractionKind } from '../../../packages/professional-tasks/types.ts'
import { projectForBoundSession, resumeUnfinished } from '../../tender-host/src/orchestration.ts'
import { getKbTaskSlugs } from '../../tender-host/src/kb.ts'

const kinds = new Set<TaskInteractionKind>(['confirm_understanding', 'adjust_request', 'replan', 'continue', 'pause', 'respond_finding', 'check_deliverables'])
const prompts: Partial<Record<TaskInteractionKind, string>> = {
  continue: '继续当前任务，先读取 professional_task status 和当前实际成果，只推进已授权且未完成的工作；保留工作台人工审批、预算限制及客户验收，不能把本条继续操作当成阶段批准。',
  replan: '请根据共同任务的当前目标、最新用户要求、实际成果与未解决发现重新规划。保留有效成果，仅调整受影响步骤；先在主对话说明计划变化，不能重置工作台阶段或绕过人工门。',
  check_deliverables: '请核验共同任务中的当前实际成果，使用 professional_task check，并解释缺失文件、未覆盖要求和需补充的专业复核；检查完成不代表用户验收。',
}

/** A human action is admitted once before being delivered to the selected native executor. */
export function createTaskInteractions(ctx: any, hooks: any) {
  const busy = new Set<string>()
  const owner = (id: string) => ctx.get('agents')?.get(id)
  const native = () => ctx.get('nativeTaskExecutor')
  const state = (task: ProfessionalTask) => {
    const agent = owner(task.sessionId), execution = native()?.status?.(task.sessionId)
    const descendantsRunning = (ctx.get('agents')?.list?.() || []).some((row: any) => row.status === 'running' && hooks.rootSession(row.session.id).id === task.sessionId)
    return { paused: task.control.paused, running: !!execution?.active || agent?.status === 'running' || descendantsRunning, executor: execution?.active ? 'codex' : 'dsh', pending: !!execution?.pending || !!agent?.inbox?.hasPending || ['prepared', 'requires_executor'].includes(task.control.lastAction?.dispatch || '') }
  }
  const finish = (id: string, action: TaskInteraction, paused?: boolean) => {
    const task = hooks.store.read(id)
    return hooks.commit(id, { control: { ...task.control, ...(paused === undefined ? {} : { paused }), lastAction: action } }, task.revision, 'host', { summary: action.reason })
  }
  const reconcile = (task: ProfessionalTask) => {
    const action = task.control.lastAction, executor = native()
    if (!action || !['prepared', 'requires_executor'].includes(action.dispatch) || busy.has(task.sessionId)) return task
    const exists = executor?.hasOperation ? executor.hasOperation(task.sessionId, action.operationId) : !!executor
    if (exists) return task
    return finish(task.sessionId, { ...action, dispatch: 'blocked', reason: '准备中的任务操作已失效，请刷新后重新操作；没有自动重复执行。', at: new Date().toISOString() })
  }
  const result = async (id: string, action?: TaskInteraction) => {
    const status = await hooks.readStatus(owner(id))
    const current = action?.operationId === status.task.control.lastAction?.operationId ? status.task.control.lastAction : action
    return { ...status, ...(current ? { interaction: current } : {}) }
  }
  const project = (task: ProfessionalTask) => task.binding?.cwd && projectForBoundSession(task.binding.cwd, task.sessionId)
  const stopAgents = async (id: string) => {
    const rows = (ctx.get('agents')?.list?.() || []).filter((row: any) => hooks.rootSession(row.session.id).id === id)
    for (const row of rows) row.cancel?.({ kind: 'user' }, { keepInbox: true })
    const running = rows.filter((row: any) => row.status === 'running')
    if (!running.length) return true
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([Promise.all(running.map((row: any) => row.whenIdle?.())).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 5000) })])
      return rows.every((row: any) => row.status !== 'running')
    } finally { clearTimeout(timer) }
  }
  const runtimePause = (task: ProfessionalTask, paused: boolean) => {
    const bound = project(task)
    if (bound) return ctx.get('longTaskRuntime')?.pause?.(task.binding!.cwd, bound, task.sessionId, paused)
  }
  async function ackUserAction(id: string, operationId: string, receipt: any) {
    const task = hooks.store.read(id), previous = task.control.lastAction
    if (!previous || previous.operationId !== operationId) return result(id)
    if (!['prepared', 'requires_executor'].includes(previous.dispatch)) return result(id, previous)
    if (!['queued', 'steered', 'paused', 'blocked'].includes(receipt?.dispatch) || !receipt.reason?.trim()) throw new Error('原生执行回执无效。')
    if (previous.messageId && receipt.messageId && previous.messageId !== receipt.messageId) throw new Error('原生执行回执与准备的用户消息不一致。')
    const pendingStop = previous.kind === 'pause' && receipt.dispatch === 'paused' && (ctx.get('agents')?.list?.() || []).some((row: any) => hooks.rootSession(row.session.id).id === id && row.status === 'running')
    const action = { ...previous, dispatch: pendingStop ? 'blocked' : receipt.dispatch, reason: pendingStop ? 'Codex 已停止，自动接续已暂停；仍有子任务执行待停止确认。' : receipt.reason, ...(receipt.messageId ? { messageId: receipt.messageId } : {}), operationId, kind: previous.kind, at: new Date().toISOString() }
    finish(id, action, previous.kind === 'pause' ? true : previous.kind === 'continue' && receipt.dispatch !== 'blocked' ? false : undefined)
    return result(id, action)
  }
  async function run(id: string, input: any) {
    if (hooks.rootSession(id).id !== id) throw new Error('请在主对话中控制共同任务，子任务不能调整主任务执行。')
    if (!owner(id)) throw new Error('请先打开主对话，再操作当前任务。')
    if (!/^[\w:-]{1,180}$/.test(input.operationId || '')) throw new Error('任务交互需要有效的操作编号。')
    const command = input.command || {}, kind = command.kind as TaskInteractionKind
    if (!kinds.has(kind) || (command.executor !== undefined && !['dsh', 'codex'].includes(command.executor))) throw new Error('未知任务交互操作或执行器。')
    if ((['adjust_request', 'respond_finding'].includes(kind) || kind === 'replan' && command.text !== undefined) && (typeof command.text !== 'string' || !command.text.trim() || command.text.length > 100_000)) throw new Error('请填写本次希望调整或补充的内容。')
    const payload = { command }, key = `task-user:${input.operationId}`
    const replay = hooks.store.replay(id, key, payload, 'host')
    if (replay) return result(id, replay.control.lastAction?.operationId === input.operationId ? replay.control.lastAction : { operationId: input.operationId, kind, dispatch: 'recorded', reason: '该操作已经登记，不会重复派发。', at: replay.updatedAt })
    if (busy.has(id)) throw new Error('当前任务正在处理另一项交互，请等待后重试。')
    busy.add(id)
    let action: TaskInteraction | undefined, wasPaused = false
    try {
      const status = await hooks.readStatus(owner(id))
      let task = status.task as ProfessionalTask
      wasPaused = task.control.paused
      if (input.revision !== task.revision) throw new Error('任务已更新，请读取最新版本并核对后重试。')
      if (['prepared', 'requires_executor'].includes(task.control.lastAction?.dispatch || '') && kind !== 'pause') throw new Error('上一项操作仍在等待执行器确认，请先等待或暂停，避免重复派发。')
      if (kind === 'respond_finding' && !task.findings.some(row => row.id === command.findingId && row.status === 'open')) throw new Error('该发现已变化或不再待处理，请读取最新任务。')
      if (kind === 'confirm_understanding' && !task.brief.objective.trim()) throw new Error('尚未形成明确目标，请先在主对话说明任务目的。')
      const agent = owner(id), nativeState = native()?.status?.(id)
      const useNative = nativeState?.active || nativeState?.pending || command.executor === 'codex'
      const blocked = !['pause', 'confirm_understanding'].includes(kind) && useNative && !nativeState?.active && (agent.status === 'running' || agent.inbox?.hasPending) ? 'DSH 正在执行或有待处理消息，请先停止或等待，再切换到 Codex。'
        : kind === 'continue' && task.pendingProjectSync ? '最新任务要求尚未同步，暂不能继续。'
          : kind === 'continue' && status.binding?.waitingHuman ? '当前阶段正在等待用户明确审批，请先查看并决定当前阶段。'
            : kind === 'continue' && task.questions.some(row => row.provider && !row.answer && ['open', 'pending', 'continued'].includes(row.status || '')) ? '有原生问题仍待回答，请先在主对话问答卡中处理；继续不会替你作答。' : undefined
      action = { operationId: input.operationId, kind, dispatch: blocked ? 'blocked' : 'prepared', reason: blocked || '用户操作已登记，正在交给当前执行器。', at: new Date().toISOString(), ...(kind === 'respond_finding' ? { findingId: command.findingId } : {}) }
      const patch: any = { control: { ...task.control, lastAction: action } }
      if (kind === 'confirm_understanding' && !blocked) {
        patch.briefProvenance = { ...task.briefProvenance }
        for (const [field, value] of Object.entries(task.brief)) if (typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.length : Object.values(value).some(row => typeof row === 'string' ? row.trim() : Array.isArray(row) && row.length)) patch.briefProvenance[field] = { ...patch.briefProvenance[field], origin: 'user', status: 'confirmed', updatedRevision: task.revision + 1 }
        action.dispatch = 'recorded'; action.reason = '已确认当前任务理解；阶段审批、成果验收和签署仍需分别确认。'
      }
      if (kind === 'pause') patch.control.paused = true
      task = hooks.commit(id, patch, task.revision, 'host', { operationId: key, operationPayload: payload, summary: action.reason })
      if (blocked || kind === 'confirm_understanding') return result(id, action)
      if (kind === 'pause') {
        const stopping = stopAgents(id)
        runtimePause(task, true)
        const goals = ctx.get('goals'), goal = goals?.get?.(agent)
        if (goal?.phase === 'active') goals.pause(agent, { id: goal.id, revision: goal.revision })
        const stopped = await stopping
        if (!stopped && !useNative) {
          action = { ...action, dispatch: 'blocked', reason: '自动接续已暂停，当前执行仍待停止确认；请等待工具收敛后再读取状态。' }; finish(id, action, true); return result(id, action)
        }
        const receipt = useNative ? await native()?.pause?.(id, input.operationId) : { dispatch: 'paused', reason: '已暂停当前执行及自动接续；已有成果和任务要求保留。' }
        action = { ...action, ...(receipt || { dispatch: 'blocked', reason: '原生执行器不可用，暂停尚未确认。' }) }
        finish(id, action, true)
        return result(id, action)
      }
      let continuation: any
      if (useNative) {
        runtimePause(task, true)
        const goals = ctx.get('goals'), goal = goals?.get?.(agent)
        if (goal?.phase === 'active') goals.pause(agent, { id: goal.id, revision: goal.revision })
      }
      if (kind === 'continue') {
        const runtime = runtimePause(task, false)
        if (useNative) runtimePause(task, true)
        if (runtime && ['blocked', 'needs_review'].includes(runtime.phase)) throw new Error(runtime.reason)
        if (task.binding && agent.status !== 'running' && !nativeState?.active && !agent.inbox?.hasPending) {
          const bound = project(task)
          continuation = bound && resumeUnfinished(task.binding.cwd!, bound, getKbTaskSlugs(id), { sessionId: id })
          if (continuation?.blocked) throw new Error(continuation.blocked)
          if (continuation?.done) {
            action = { ...action, dispatch: 'recorded', reason: continuation.message || '工作台所有阶段已完成。' }; finish(id, action, false); return result(id, action)
          }
          if (continuation?.draft && continuation.dispatch && !useNative && ctx.get('longTaskRuntime')) {
            const runtimeService = ctx.get('longTaskRuntime')
            runtimeService.offer(task.binding.cwd!, bound, id, continuation)
            finish(id, action, false)
            const resumed = await runtimeService.dispatch(task.binding.cwd!, bound, { sessionId: id, ...continuation.dispatch })
            action = { ...action, dispatch: resumed.phase === 'waiting' ? 'queued' : resumed.phase === 'ready' ? 'queued' : 'blocked', reason: resumed.reason, messageId: resumed.attempt?.messageId }; finish(id, action, action.dispatch === 'blocked' ? undefined : false); return result(id, action)
          }
        }
        const goals = ctx.get('goals'), goal = goals?.get?.(agent)
        if (useNative && goal?.roundsStarted >= goal?.maxGoalRounds) throw new Error('当前目标的执行轮次预算已耗尽，请先调整预算后继续。')
        if (!useNative && goal && (['paused', 'blocked'].includes(goal.phase) || goal.phase === 'active' && goal.activation === 'disarmed')) goals.resume(agent, { id: goal.id, revision: goal.revision })
      }
      const genuine = kind === 'adjust_request' || kind === 'respond_finding' || kind === 'replan' && !!command.text?.trim()
      const finding = kind === 'respond_finding' ? task.findings.find(row => row.id === command.findingId) : undefined
      const text = genuine ? command.text.trim() : continuation?.draft || prompts[kind]!
      const message = hooks.createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
      action.messageId = message.id
      finish(id, action)
      if (genuine) {
        task = hooks.service.admitHumanMessage(id, text, message.id).task
        if (task.binding) task = hooks.syncUserRequest(task, { id: key, text, messageId: message.id })
      } else hooks.service.registerControlPrompt(id, text)
      if (useNative) {
        const receipt = await native()?.dispatch?.({ sessionId: id, operationId: input.operationId, message, kind, findingId: command.findingId })
        action = { ...action, ...(receipt || { dispatch: 'blocked', reason: 'Codex 执行入口不可用，请打开桌面应用后重试。' }) }
      } else {
        if (kind === 'replan' && genuine) agent.inject?.(hooks.createUserMessage({ content: [{ type: 'text', text: '用户通过本次任务点击重新规划；请结合这条真实调整重审当前计划，仅修改受影响步骤，不重置阶段审批。' }], source: { kind: 'plugin:agent-pi-task-guide' } }))
        if (finding) agent.inject?.(hooks.createUserMessage({ content: [{ type: 'text', text: `本次用户补充关联共同任务发现 ${finding.id}（${finding.title}），用户补充不等于该发现已经解决。` }], source: { kind: 'plugin:agent-pi-task-guide' } }))
        if (kind === 'continue') finish(id, action, false)
        const running = agent.status === 'running'
        if (running) agent.steer(message)
        else agent.followup(message)
        action = { ...action, dispatch: running ? 'steered' : 'queued', reason: running ? '已交给当前执行器，将在下一执行边界处理本次要求。' : '已提交主对话，执行器将处理本次要求。' }
      }
      finish(id, action, kind === 'continue' && ['queued', 'steered'].includes(action.dispatch) ? false : undefined)
      return result(id, action)
    } catch (error) {
      if (action) {
        action = { ...action, dispatch: 'blocked', reason: String((error as Error).message) }
        if (kind === 'continue' && wasPaused) runtimePause(hooks.store.read(id), true)
        finish(id, action, kind === 'continue' && wasPaused ? true : undefined)
        return result(id, action)
      }
      throw error
    } finally { busy.delete(id) }
  }
  return { run, state, reconcile, ackUserAction }
}
