import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorkbenchSessionMonitor } from '../src/client/session-monitor.js'
import { createSessionTransactionRegistry } from '../src/session-transaction.ts'

type MonitorHarness = ReturnType<typeof createHarness>

function createHarness(overrides: Record<string, unknown> = {}) {
  const registry = createSessionTransactionRegistry<{ cwd: string; module: string; projectId: string }>()
  const snapshots = new Map<string, unknown>([['parent', { running: false, nodes: [] }]])
  const apiCalls: Array<{ action: string; body: Record<string, unknown> }> = []
  const dispatches: Array<{ text: string; sessionId: string }> = []
  let sessionList: unknown = { byId: { parent: { id: 'parent', running: false } } }
  let realityDigest = 'facts-1'
  let timerStarted = 0
  let timerCleared = 0

  const dependencies = {
    api: async (_path: string, _cwd: string, init: { body: string }) => {
      const body = JSON.parse(init.body)
      apiCalls.push({ action: body.action, body })
      if (body.action === 'check') return {
        reality: { ok: true },
        control: { alignment: 'aligned', realityDigest, differences: [] },
      }
      if (body.action === 'resume') {
        return {
          draft: '继续当前投标阶段',
          message: '已准备',
          dispatch: { stageId: 'analysis', key: 'task-1' },
        }
      }
      return { ok: true }
    },
    activeSessionId: () => 'parent',
    dispatchToConversation: async (_props: unknown, text: string, sessionId: string) => {
      dispatches.push({ text, sessionId })
      return true
    },
    flushQueuedToParent: async () => true,
    pinParentSessionId: () => 'parent',
    readSessionListSnap: () => sessionList,
    snapshotOf: (sessionId: string) => snapshots.get(sessionId) || null,
    prepareTransaction: (sessionId: string, payload: { cwd: string; module: string; projectId: string }) => registry.prepare(sessionId, payload),
    commitTransaction: (sessionId: string) => registry.commit(sessionId),
    transactionCanRun: (sessionId: string) => registry.canRun(sessionId),
    settleTransaction: (sessionId: string, phase: string, error?: unknown) => (
      phase === 'succeeded' ? registry.succeed(sessionId) : registry.fail(sessionId, error)
    ),
    destroyTransaction: (sessionId: string) => registry.destroy(sessionId),
    setIntervalFn: () => {
      timerStarted += 1
      return { id: timerStarted }
    },
    clearIntervalFn: () => { timerCleared += 1 },
    onChange: () => {},
    ...overrides,
  }

  const monitor = createWorkbenchSessionMonitor(dependencies)
  return {
    monitor,
    registry,
    snapshots,
    apiCalls,
    dispatches,
    setSessionList(value: unknown) { sessionList = value },
    setRealityDigest(value: string) { realityDigest = value },
    timerStats() { return { started: timerStarted, cleared: timerCleared } },
  }
}

function start(harness: MonitorHarness) {
  harness.monitor.start({ cwd: 'D:\\Bid', module: 'tender', projectId: 'project-1' })
}

test('monitor starts only through an explicitly committed per-session transaction', () => {
  const harness = createHarness()
  start(harness)

  assert.equal(harness.registry.canRun('parent'), true)
  assert.equal(harness.monitor.state.monitoring, true)
  assert.equal(harness.monitor.state.note, '本轮已显式派发；工作台只观察 DSH，空闲后核对一次，不会自动派活。')
  assert.deepEqual(harness.timerStats(), { started: 1, cleared: 0 })
})

test('monitor restore resumes observation but not task dispatch', async () => {
  const harness = createHarness()
  harness.registry.prepare('parent', { cwd: 'D:\\Bid', module: 'tender', projectId: 'project-1' })
  harness.registry.commit('parent')

  harness.monitor.restore({ cwd: 'D:\\Bid', module: 'tender', projectId: 'project-1' }, 'parent')

  assert.equal(harness.registry.canRun('parent'), true)
  assert.equal(harness.monitor.state.monitoring, true)
  assert.match(harness.monitor.state.note, /已恢复/)
  assert.deepEqual(harness.timerStats(), { started: 1, cleared: 0 })
  await harness.monitor.tick()
  assert.deepEqual(harness.apiCalls, [])
  assert.deepEqual(harness.dispatches, [])
})

test('monitor never calls stage resume without a committed transaction', async () => {
  const harness = createHarness()
  harness.registry.prepare('parent', { cwd: 'D:\\Bid', module: 'tender', projectId: 'project-1' })
  Object.assign(harness.monitor.state, {
    cwd: 'D:\\Bid',
    module: 'tender',
    projectId: 'project-1',
    parentSessionId: 'parent',
    monitoring: true,
  })

  await harness.monitor.tick()

  assert.deepEqual(harness.apiCalls, [])
  assert.equal(harness.monitor.state.monitoring, false)
  assert.match(harness.monitor.state.note, /事务未提交或已结束/)
})

test('monitor waits while a descendant session is still running', async () => {
  const harness = createHarness()
  harness.setSessionList({
    byId: {
      parent: { id: 'parent', running: false },
      child: { id: 'child', origin: 'subagent', parentId: 'parent', running: true },
    },
  })
  start(harness)

  await harness.monitor.tick()

  assert.deepEqual(harness.apiCalls, [])
  assert.match(harness.monitor.state.note, /1 个 DSH 子智能体仍在执行/)
})

test('idle committed monitor checks once and never resumes or dispatches', async () => {
  const harness = createHarness()
  start(harness)

  await harness.monitor.tick()

  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])
  assert.deepEqual(harness.dispatches, [])
  assert.equal(harness.monitor.state.lastReality.ok, true)
  assert.equal(harness.monitor.state.lastControl.realityDigest, 'facts-1')
  assert.equal(harness.apiCalls[0]?.body.sessionId, 'parent')
  assert.equal(harness.monitor.sending, false)

  await harness.monitor.tick()
  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])
  assert.equal(harness.monitor.state.monitoring, false)
})

test('monitor checks a busy-to-idle edge once and keeps static reality silent', async () => {
  const harness = createHarness()
  harness.snapshots.set('parent', { running: true, nodes: [] })
  start(harness)

  await harness.monitor.tick()
  assert.deepEqual(harness.apiCalls, [])

  harness.snapshots.set('parent', { running: false, nodes: [] })
  await harness.monitor.tick()
  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])

  harness.snapshots.set('parent', { running: true, nodes: [] })
  await harness.monitor.tick()
  harness.snapshots.set('parent', { running: false, nodes: [] })
  await harness.monitor.tick()

  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])
  assert.equal(harness.dispatches.length, 0)
  assert.match(harness.monitor.state.note, /继续下一步需再次点击/)
})

test('reality changes update the monitor but never auto-resume without another explicit click', async () => {
  const harness = createHarness()
  start(harness)
  await harness.monitor.tick()

  harness.setRealityDigest('facts-2')
  await harness.monitor.tick()

  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])
  assert.equal(harness.dispatches.length, 0)
})

test('assistant continuation text cannot wake or steer the parent automatically', async () => {
  const harness = createHarness()
  harness.snapshots.set('parent', {
    running: false,
    nodes: [{ kind: 'assistant', blocks: [{ kind: 'text', text: '继续分批补齐剩余 BOQ 并回填能力包，是否按此继续？' }] }],
  })
  start(harness)

  await harness.monitor.tick()

  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])
  assert.equal(harness.dispatches.length, 0)

  await harness.monitor.tick()
  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])
  assert.equal(harness.dispatches.length, 0)
})

test('monitor waits until a newly submitted user requirement reaches the project ledger', async () => {
  let pending = true
  const harness = createHarness({ requirementsPending: () => pending })
  start(harness)

  await harness.monitor.tick()
  assert.deepEqual(harness.apiCalls, [])
  assert.match(harness.monitor.state.note, /等待落账/)

  pending = false
  await harness.monitor.tick()
  assert.deepEqual(harness.apiCalls.map((call) => call.action), ['check'])
})

test('destroying the parent session destroys its monitor transaction', async () => {
  const harness = createHarness()
  start(harness)
  harness.snapshots.set('parent', { removed: true })

  await harness.monitor.tick()

  assert.equal(harness.registry.get('parent'), undefined)
  assert.equal(harness.monitor.state.monitoring, false)
  assert.match(harness.monitor.state.note, /主会话已销毁/)
})
