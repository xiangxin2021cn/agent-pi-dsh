export const DEFAULT_MONITOR_TICK_MS = 15000

// This timer only reads the durable host ledger. It never dispatches or settles work.
export function createWorkbenchSessionMonitor(options) {
  const api = options.api
  const onChange = options.onChange || (() => {})
  const setIntervalFn = options.setIntervalFn || ((fn, ms) => setInterval(fn, ms))
  const clearIntervalFn = options.clearIntervalFn || (timer => clearInterval(timer))
  return {
    state: { cwd: '', module: 'tender', projectId: '', parentSessionId: '', monitoring: false,
      paused: false, lastCheck: 0, note: '', done: false, lastReality: null, lastControl: null, runtime: null },
    timer: null,
    sending: false,
    emit() { onChange() },
    start(target) {
      const parent = options.pinParentSessionId()
      if (!parent) throw new Error('请先打开主会话，再查看执行状态。')
      return this.restore(target, parent)
    },
    restore(target, parentSessionId) {
      if (!target?.cwd || !target?.projectId || !parentSessionId) return false
      Object.assign(this.state, { ...target, module: target.module || 'tender', parentSessionId, monitoring: true })
      if (!this.timer) this.timer = setIntervalFn(() => { void this.tick() }, options.tickMs || DEFAULT_MONITOR_TICK_MS)
      void this.tick()
      this.emit()
      return true
    },
    pause() { return this.setPaused(true) },
    unpause() { return this.setPaused(false) },
    setPaused(paused) {
      return api('/api/agent-pi/stage', this.state.cwd, { method: 'POST',
        body: JSON.stringify({ action: 'runtime_pause', module: this.state.module,
          projectId: this.state.projectId, sessionId: this.state.parentSessionId, paused }) })
        .then(result => { this.apply(result.runtime); return this.tick() })
        .catch(error => { this.state.note = String(error.message || error); this.emit() })
    },
    apply(runtime) {
      this.state.runtime = runtime || null
      this.state.paused = runtime?.phase === 'paused'
      this.state.done = runtime?.phase === 'done'
      this.state.note = runtime?.reason || '当前没有宿主执行记录。'
      this.state.lastCheck = Date.now()
      this.emit()
    },
    stop(note) {
      this.state.monitoring = false
      if (note) this.state.note = note
      if (this.timer) { clearIntervalFn(this.timer); this.timer = null }
      this.emit()
    },
    tick() {
      if (!this.state.monitoring || this.sending) return Promise.resolve()
      this.sending = true
      const target = { ...this.state }
      return api('/api/agent-pi/stage', target.cwd, { method: 'POST',
        body: JSON.stringify({ action: 'runtime_status', module: target.module,
          projectId: target.projectId, sessionId: target.parentSessionId }) })
        .then(result => {
          if (this.state.parentSessionId !== target.parentSessionId || this.state.projectId !== target.projectId) return
          this.apply(result.runtime)
        })
        .catch(error => { this.state.note = String(error.message || error); this.emit() })
        .finally(() => { this.sending = false })
    },
  }
}
