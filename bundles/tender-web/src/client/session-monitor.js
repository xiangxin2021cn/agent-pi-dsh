import {
  sessionActivity,
  sessionExecutionActive,
} from '../session-wake.ts'

export const DEFAULT_MONITOR_TICK_MS = 15000

export function createWorkbenchSessionMonitor(options) {
  const api = options.api
  const pinParentSessionId = options.pinParentSessionId
  const readSessionListSnap = options.readSessionListSnap
  const snapshotOf = options.snapshotOf
  const prepareTransaction = options.prepareTransaction
  const commitTransaction = options.commitTransaction
  const transactionCanRun = options.transactionCanRun
  const settleTransaction = options.settleTransaction
  const destroyTransaction = options.destroyTransaction
  const setTransactionPaused = options.setTransactionPaused || (() => {})
  const requirementsPending = options.requirementsPending || (() => false)
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
      monitoring: false,
      paused: false,
      lastCheck: 0,
      note: '',
      settlementCheckPending: false,
      observedExecutionActive: false,
      done: false,
      lastReality: null,
      lastControl: null,
      lastRealityDigest: '',
    },
    sending: false,
    timer: null,
    emit() {
      onChange()
    },
    start(target) {
      const previousTarget = `${this.state.parentSessionId}\n${this.state.cwd}\n${this.state.module}\n${this.state.projectId}`
      if (target && target.cwd && target.projectId) {
        this.state.cwd = target.cwd
        this.state.module = target.module || 'tender'
        this.state.projectId = target.projectId
      }
      if (!this.state.cwd || !this.state.projectId) return
      const parentSessionId = pinParentSessionId()
      if (!parentSessionId) throw new Error('请先打开主会话，再启动自动推进。')
      const nextTarget = `${parentSessionId}\n${this.state.cwd}\n${this.state.module}\n${this.state.projectId}`
      if (previousTarget !== nextTarget) {
        this.state.lastRealityDigest = ''
        this.state.observedExecutionActive = false
      }
      const transaction = prepareTransaction(parentSessionId, {
        cwd: this.state.cwd,
        module: this.state.module,
        projectId: this.state.projectId,
      })
      if (transaction.phase === 'prepared') commitTransaction(parentSessionId)
      setTransactionPaused(parentSessionId, false)
      this.state.monitoring = true
      this.state.paused = false
      this.state.done = false
      this.state.parentSessionId = parentSessionId
      this.state.note = '本轮已显式派发；工作台只观察 DSH，空闲后核对一次，不会自动派活。'
      this.state.settlementCheckPending = true
      this.state.observedExecutionActive = false
      this.ensureTimer()
      this.emit()
    },
    restore(target, parentSessionId, paused = false) {
      if (!target || !target.cwd || !target.projectId || !parentSessionId) return false
      if (!transactionCanRun(parentSessionId)) return false
      this.state.cwd = target.cwd
      this.state.module = target.module || 'tender'
      this.state.projectId = target.projectId
      this.state.parentSessionId = parentSessionId
      this.state.monitoring = true
      this.state.paused = Boolean(paused)
      this.state.done = false
      this.state.note = paused
        ? '已恢复本会话监控；保持暂停。'
        : '已恢复本会话监控；不会自动派活。'
      this.state.settlementCheckPending = false
      this.state.observedExecutionActive = false
      this.ensureTimer()
      this.emit()
      return true
    },
    pause() {
      this.state.paused = true
      setTransactionPaused(this.state.parentSessionId, true)
      this.emit()
    },
    unpause() {
      if (!this.state.monitoring) return
      this.state.paused = false
      setTransactionPaused(this.state.parentSessionId, false)
      if (!this.state.parentSessionId) this.state.parentSessionId = pinParentSessionId()
      this.emit()
    },
    stop(note, outcome) {
      const parentId = this.state.parentSessionId
      if (parentId && outcome === 'succeeded') settleTransaction(parentId, 'succeeded')
      else if (parentId && outcome === 'failed') settleTransaction(parentId, 'failed', note)
      setTransactionPaused(parentId, false)
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
      if (requirementsPending(parentId)) {
        state.lastCheck = Date.now()
        state.note = '用户最新要求正在写入项目账本，自动推进等待落账。'
        this.emit()
        return undefined
      }
      const sessionList = readSessionListSnap()
      const executionActive = sessionExecutionActive(parentSnap, sessionList, parentId)
      const runningChildren = sessionActivity(sessionList, parentId).runningChildCount
      state.lastCheck = Date.now()
      if (executionActive) {
        state.observedExecutionActive = true
        state.note = runningChildren > 0
          ? `${runningChildren} 个 DSH 子智能体仍在执行；工作台只观察，不插话。`
          : 'DSH 主智能体正在执行；工作台只观察，不插话。'
        this.emit()
        return undefined
      }
      if (this.sending) {
        this.emit()
        return undefined
      }
      if (!state.settlementCheckPending && !state.observedExecutionActive) return undefined
      state.settlementCheckPending = false
      state.observedExecutionActive = false
      this.sending = true
      return api('/api/agent-pi/stage', state.cwd, {
        method: 'POST',
        body: JSON.stringify({ action: 'check', module: state.module, projectId: state.projectId, sessionId: parentId }),
      }).then((checked) => {
        if (checked && checked.reality) {
          state.lastReality = checked.reality
          state.lastControl = checked.control || null
          this.emit()
        }
        const realityDigest = String(checked && checked.control && checked.control.realityDigest || '')
        const unchanged = Boolean(realityDigest && realityDigest === state.lastRealityDigest)
        if (realityDigest) state.lastRealityDigest = realityDigest
        this.stop(
          unchanged
            ? '本轮 DSH 已空闲，项目事实未变化；继续下一步需再次点击「继续推进」。'
            : '本轮 DSH 已空闲，工作台已核对一次盘面；继续下一步需再次点击「继续推进」。',
          'succeeded',
        )
      }).catch((error) => {
        this.stop(String((error && error.message) || error), 'failed')
      }).finally(() => { this.sending = false })
    },
  }
}
