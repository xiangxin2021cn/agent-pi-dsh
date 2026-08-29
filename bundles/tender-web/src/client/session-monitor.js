import {
  buildParentWakePrompt,
  inboundNeedsParentWake,
  lastChildReturn,
  queuedMessages,
  sessionActivity,
  sessionExecutionActive,
  snapshotIsBusy,
  snapshotIsRunning,
} from '../session-wake.ts'

export const DEFAULT_MONITOR_TICK_MS = 15000

export function createWorkbenchSessionMonitor(options) {
  const api = options.api
  const activeSessionId = options.activeSessionId
  const dispatchToConversation = options.dispatchToConversation
  const flushQueuedToParent = options.flushQueuedToParent
  const pinParentSessionId = options.pinParentSessionId
  const readSessionListSnap = options.readSessionListSnap
  const snapshotOf = options.snapshotOf
  const prepareTransaction = options.prepareTransaction
  const commitTransaction = options.commitTransaction
  const transactionCanRun = options.transactionCanRun
  const settleTransaction = options.settleTransaction
  const destroyTransaction = options.destroyTransaction
  const onChange = options.onChange || (() => {})
  const setIntervalFn = options.setIntervalFn || ((callback, delay) => setInterval(callback, delay))
  const clearIntervalFn = options.clearIntervalFn || ((timer) => clearInterval(timer))
  const tickMs = options.tickMs || DEFAULT_MONITOR_TICK_MS

  return {
    state: {
      cwd: '',
      module: 'tender',
      projectId: '',
      parentSessionId: '',
      lastForwarded: '',
      monitoring: false,
      paused: false,
      lastCheck: 0,
      note: '',
      wasBusy: false,
      done: false,
      lastReality: null,
    },
    sending: false,
    steeringQueue: false,
    timer: null,
    emit() {
      onChange()
    },
    start(target) {
      if (target && target.cwd && target.projectId) {
        this.state.cwd = target.cwd
        this.state.module = target.module || 'tender'
        this.state.projectId = target.projectId
      }
      if (!this.state.cwd || !this.state.projectId) return
      const parentSessionId = pinParentSessionId()
      if (!parentSessionId) throw new Error('请先打开主会话，再启动自动推进。')
      const transaction = prepareTransaction(parentSessionId, {
        cwd: this.state.cwd,
        module: this.state.module,
        projectId: this.state.projectId,
      })
      if (transaction.phase === 'prepared') commitTransaction(parentSessionId)
      this.state.monitoring = true
      this.state.paused = false
      this.state.done = false
      this.state.parentSessionId = parentSessionId
      this.state.note = '本会话自动推进事务已显式启动。'
      this.state.wasBusy = snapshotIsBusy(snapshotOf(parentSessionId))
      this.ensureTimer()
      this.emit()
    },
    pause() {
      this.state.paused = true
      this.emit()
    },
    unpause() {
      if (!this.state.monitoring) return
      this.state.paused = false
      if (!this.state.parentSessionId) this.state.parentSessionId = pinParentSessionId()
      this.state.wasBusy = snapshotIsBusy(snapshotOf(this.state.parentSessionId))
      this.emit()
    },
    stop(note, outcome) {
      const parentId = this.state.parentSessionId
      if (parentId && outcome === 'succeeded') settleTransaction(parentId, 'succeeded')
      else if (parentId && outcome === 'failed') settleTransaction(parentId, 'failed', note)
      this.state.monitoring = false
      if (note) this.state.note = note
      if (this.timer) {
        clearIntervalFn(this.timer)
        this.timer = null
      }
      this.emit()
    },
    ensureTimer() {
      if (this.timer) return
      this.timer = setIntervalFn(() => { this.tick() }, tickMs)
    },
    tick() {
      const state = this.state
      if (!state.monitoring || state.paused || !state.cwd || !state.projectId) return undefined
      if (!state.parentSessionId) state.parentSessionId = pinParentSessionId()
      const parentId = state.parentSessionId
      if (!transactionCanRun(parentId)) {
        this.stop('自动推进事务未提交或已结束；请在工作台重新点「继续推进」。')
        return undefined
      }
      const parentSnap = snapshotOf(parentId)
      if (parentSnap && parentSnap.removed === true) {
        destroyTransaction(parentId)
        this.stop('主会话已销毁，自动推进事务同时结束。')
        return undefined
      }
      const parentRunning = snapshotIsRunning(parentSnap)
      const sessionList = readSessionListSnap()
      const executionActive = sessionExecutionActive(parentSnap, sessionList, parentId)
      const runningChildren = sessionActivity(sessionList, parentId).runningChildCount
      const queued = queuedMessages(parentSnap)
      const viewedId = activeSessionId()
      const viewedSnap = viewedId && viewedId !== parentId ? snapshotOf(viewedId) : null
      const viewedBusy = snapshotIsBusy(viewedSnap)
      state.wasBusy = executionActive || queued.length > 0
      state.lastCheck = Date.now()
      if (queued.length && !this.steeringQueue && !this.sending) {
        this.steeringQueue = true
        const task = flushQueuedToParent(parentId).then((ok) => {
          if (!ok) return
          state.wasBusy = true
          state.note = '已把主对话排队指令插进当前轮。'
          this.emit()
        }).catch((error) => {
          state.note = String((error && error.message) || error)
          this.emit()
        }).finally(() => { this.steeringQueue = false })
        this.emit()
        return task
      }
      if (!parentRunning && viewedId && viewedId !== parentId && !viewedBusy) {
        const verdict = lastChildReturn(viewedSnap)
        const token = verdict ? `${viewedId}\n${verdict}` : ''
        if (verdict && token !== state.lastForwarded) {
          state.lastForwarded = token
          const framed = buildParentWakePrompt({ kind: 'child-return', text: verdict })
          const task = dispatchToConversation({}, framed, parentId).then((ok) => {
            if (!ok) return
            state.wasBusy = true
            state.note = '已把子智能体回推送进主对话。'
            this.emit()
          }).catch((error) => {
            state.note = String((error && error.message) || error)
            this.emit()
          })
          this.emit()
          return task
        }
      }
      if (!parentRunning) {
        const hit = inboundNeedsParentWake(parentSnap)
        const token = hit ? `parent\n${hit.kind}\n${hit.text}` : ''
        if (hit && token !== state.lastForwarded) {
          state.lastForwarded = token
          const task = dispatchToConversation({}, buildParentWakePrompt(hit), parentId).then((ok) => {
            if (!ok) return
            state.wasBusy = true
            state.note = hit.kind === 'child-return'
              ? '子代理已回传，已叫醒主对话。'
              : '已把未接续的主对话指令重新推入。'
            this.emit()
          }).catch((error) => {
            state.note = String((error && error.message) || error)
            this.emit()
          })
          this.emit()
          return task
        }
      }
      if (executionActive) {
        if (!parentRunning && runningChildren > 0) state.note = `${runningChildren} 个子智能体仍在执行，监控等待回推。`
        this.emit()
        return undefined
      }
      if (this.sending) {
        this.emit()
        return undefined
      }
      this.sending = true
      return api('/api/agent-pi/stage', state.cwd, {
        method: 'POST',
        body: JSON.stringify({ action: 'check', module: state.module, projectId: state.projectId }),
      }).then((checked) => {
        if (checked && checked.reality) {
          state.lastReality = checked.reality
          this.emit()
        }
      }).catch(() => {}).then(() => api('/api/agent-pi/stage', state.cwd, {
        method: 'POST',
        body: JSON.stringify({ action: 'resume', module: state.module, projectId: state.projectId, sessionId: parentId }),
      })).then((result) => {
        if (result.done) {
          state.done = true
          this.stop(result.message || '流程已全部完成。', 'succeeded')
          return undefined
        }
        if (result.blocked) {
          this.stop(result.message || result.blocked, 'failed')
          return undefined
        }
        if (result.alreadyDispatched || !result.draft) {
          state.note = result.message || ''
          this.emit()
          return undefined
        }
        return dispatchToConversation({}, result.draft, parentId).then((ok) => {
          if (!ok) return undefined
          state.wasBusy = true
          state.note = result.message || ''
          this.emit()
          if (!result.dispatch) return undefined
          return api('/api/agent-pi/stage', state.cwd, {
            method: 'POST',
            body: JSON.stringify({
              action: 'mark_dispatched',
              module: state.module,
              projectId: state.projectId,
              stageId: result.dispatch.stageId,
              key: result.dispatch.key,
            }),
          }).catch(() => {})
        }).catch((error) => {
          this.stop(String((error && error.message) || error), 'failed')
        })
      }).catch((error) => {
        this.stop(String((error && error.message) || error), 'failed')
      }).finally(() => { this.sending = false })
    },
  }
}
