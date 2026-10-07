export const DEFAULT_MONITOR_TICK_MS = 15000

const normalizedCwd = value => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const sameTarget = (left, right) => !!left && !!right && normalizedCwd(left.cwd) === normalizedCwd(right.cwd)
  && (left.module || 'tender') === (right.module || 'tender') && left.projectId === right.projectId
  && left.parentSessionId === right.parentSessionId

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
    generation: 0,
    emit() { onChange() },
    start(target) {
      const parent = options.pinParentSessionId()
      if (!parent) throw new Error('请先打开主会话，再查看执行状态。')
      return this.restore(target, parent)
    },
    async restore(target, parentSessionId) {
      this.stop()
      if (!target?.cwd || !target?.projectId || !parentSessionId) return false
      const generation = this.generation
      const selected = { ...target, module: target.module || 'tender', parentSessionId }
      Object.assign(this.state, selected, { paused: false, done: false, lastCheck: 0, note: '', lastReality: null, lastControl: null, runtime: null })
      try {
        // Selection is browsing, not permission to rebind a conversation.
        const bound = await this.isBound(selected)
        if (generation !== this.generation || !sameTarget(this.state, selected)) return false
        if (!bound) { this.state.note = '当前会话未绑定此项目，仅显示项目资料。'; this.emit(); return false }
        this.state.monitoring = true
        this.timer = setIntervalFn(() => { void this.tick() }, options.tickMs || DEFAULT_MONITOR_TICK_MS)
        void this.tick()
        this.emit()
        return true
      } catch (error) {
        if (generation === this.generation && sameTarget(this.state, selected)) { this.state.note = String(error.message || error); this.emit() }
        return false
      }
    },
    async isBound(target) {
      const result = await api('/api/agent-pi/session-project?sessionId=' + encodeURIComponent(target.parentSessionId), target.cwd, { method: 'GET' })
      const binding = result?.binding
      return sameTarget(target, binding && { ...binding, parentSessionId: binding.sessionId })
    },
    pause() { return this.setPaused(true) },
    unpause() { return this.setPaused(false) },
    async setPaused(paused) {
      if (!this.state.monitoring) return
      const target = { ...this.state }, generation = this.generation
      try {
        const bound = await this.isBound(target)
        if (generation !== this.generation || !sameTarget(this.state, target)) return
        if (!bound) { this.stop('当前会话已切换绑定，停止本项目监控。'); return }
        const result = await api('/api/agent-pi/stage', target.cwd, { method: 'POST',
          body: JSON.stringify({ action: 'runtime_pause', module: target.module,
            projectId: target.projectId, sessionId: target.parentSessionId, paused }) })
        if (generation !== this.generation || !sameTarget(this.state, target)) return
        this.apply(result.runtime)
        return this.tick()
      } catch (error) {
        if (generation === this.generation && sameTarget(this.state, target)) { this.state.note = String(error.message || error); this.emit() }
      }
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
      this.generation++
      this.sending = false
      this.state.monitoring = false
      this.state.runtime = null
      if (note) this.state.note = note
      if (this.timer) { clearIntervalFn(this.timer); this.timer = null }
      this.emit()
    },
    async tick() {
      if (!this.state.monitoring || this.sending) return
      this.sending = true
      const target = { ...this.state }, generation = this.generation
      try {
        const bound = await this.isBound(target)
        if (generation !== this.generation || !sameTarget(this.state, target)) return
        if (!bound) { this.stop('当前会话已切换绑定，停止本项目监控。'); return }
        const result = await api('/api/agent-pi/stage', target.cwd, { method: 'POST',
          body: JSON.stringify({ action: 'runtime_status', module: target.module,
            projectId: target.projectId, sessionId: target.parentSessionId }) })
        if (generation !== this.generation || !sameTarget(this.state, target)) return
        this.apply(result.runtime)
      } catch (error) {
        if (generation === this.generation && sameTarget(this.state, target)) { this.state.note = String(error.message || error); this.emit() }
      } finally {
        if (generation === this.generation) this.sending = false
      }
    },
  }
}
