import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorkbenchSessionMonitor } from '../src/client/session-monitor.js'

function harness() {
  const calls: any[] = []
  let binding: any = { cwd: 'D:/Bid', module: 'tender', projectId: 'project', sessionId: 'parent' }
  let runtime: any = { phase: 'waiting', reason: '宿主正在执行', cost: 'unknown', run: { paused: false } }
  const monitor = createWorkbenchSessionMonitor({
    pinParentSessionId: () => 'parent',
    api: async (_path: string, _cwd: string, init: any) => {
      if (init.method === 'GET') return { binding }
      const body = JSON.parse(init.body); calls.push(body)
      if (body.action === 'runtime_pause') runtime = { ...runtime, phase: body.paused ? 'paused' : 'waiting', reason: body.paused ? '用户暂停保持有效。' : '宿主正在执行' }
      return { runtime }
    },
    setIntervalFn: () => ({ id: 1 }), clearIntervalFn: () => {}, onChange: () => {},
  })
  return { monitor, calls, setRuntime: (value: any) => { runtime = value }, setBinding: (value: any) => { binding = value } }
}
const target = { cwd: 'D:/Bid', module: 'tender', projectId: 'project' }

test('renderer polls only the durable host status and never dispatches or settles a turn', async () => {
  const h = harness(); h.monitor.start(target); await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.monitor.state.parentSessionId, 'parent')
  assert.ok(h.calls.length)
  assert.ok(h.calls.every(row => row.action === 'runtime_status'))
  assert.equal(h.monitor.state.note, '宿主正在执行')
})

test('fresh renderer restores a host run without a browser transaction registry', async () => {
  const h = harness(); h.setRuntime({ phase: 'paused', reason: '用户暂停保持有效。', cost: 'unknown' })
  assert.equal(await h.monitor.restore(target, 'parent'), true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.monitor.state.paused, true)
  assert.equal(h.monitor.state.runtime.cost, 'unknown')
  assert.ok(h.calls.every(row => row.action === 'runtime_status'))
})

test('pause and resume are explicit host commands; local display cannot clear a persistent pause', async () => {
  const h = harness(); h.monitor.start(target); await new Promise(resolve => setImmediate(resolve))
  await h.monitor.pause(); assert.equal(h.monitor.state.paused, true)
  await h.monitor.unpause(); assert.equal(h.monitor.state.paused, false)
  assert.deepEqual(h.calls.filter(row => row.action === 'runtime_pause').map(row => row.paused), [true, false])
  assert.ok(h.calls.every(row => row.sessionId === 'parent'))
})

test('stage completion is displayed from the host and does not start another stage', async () => {
  const h = harness(); h.monitor.start(target); await new Promise(resolve => setImmediate(resolve))
  h.setRuntime({ phase: 'done', reason: '当前阶段已核对完成；不自动开启下一阶段。' })
  await h.monitor.tick(); assert.equal(h.monitor.state.done, true)
  assert.ok(h.calls.every(row => row.action === 'runtime_status'))
})

test('closing monitoring changes no host authorization or execution state', async () => {
  const h = harness(); h.monitor.start(target); await new Promise(resolve => setImmediate(resolve))
  const count = h.calls.length
  h.monitor.stop('隐藏监控'); await h.monitor.tick()
  assert.equal(h.calls.length, count)
  assert.equal(h.monitor.state.monitoring, false)
})

test('a late response for another project cannot overwrite the current display', async () => {
  let complete: any
  const monitor = createWorkbenchSessionMonitor({ pinParentSessionId: () => 'parent',
    api: (_path: string, _cwd: string, init: any) => init.method === 'GET' ? Promise.resolve({ binding: { ...target, sessionId: 'parent' } }) : new Promise(resolve => { complete = resolve }), setIntervalFn: () => 1, clearIntervalFn: () => {}, onChange: () => {} })
  await monitor.start(target)
  await new Promise(resolve => setImmediate(resolve))
  monitor.state.projectId = 'another'
  complete({ runtime: { phase: 'done', reason: '旧项目' } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(monitor.state.runtime, null)
})

test('host errors are visible and never cause fallback dispatch', async () => {
  const monitor = createWorkbenchSessionMonitor({ pinParentSessionId: () => 'parent',
    api: async () => { throw new Error('恢复收据待核对') }, setIntervalFn: () => 1, clearIntervalFn: () => {}, onChange: () => {} })
  monitor.start(target); await new Promise(resolve => setImmediate(resolve))
  assert.equal(monitor.state.note, '恢复收据待核对')
})

test('browsing another project does not send runtime_status or rebind the conversation', async () => {
  const h = harness()
  assert.equal(await h.monitor.restore({ ...target, projectId: 'browsed-project' }, 'parent'), false)
  assert.deepEqual(h.calls, [])
  assert.equal(h.monitor.state.monitoring, false)
  assert.match(h.monitor.state.note, /未绑定/)
  assert.equal(await h.monitor.restore(target, 'parent'), true)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(h.calls.some(row => row.action === 'runtime_status'))
})

test('a host binding change stops polling and prevents pause commands for the former project', async () => {
  const h = harness()
  await h.monitor.start(target)
  await new Promise(resolve => setImmediate(resolve))
  const count = h.calls.length
  h.setBinding({ ...target, module: 'china-tender', sessionId: 'parent' })
  await h.monitor.tick()
  await h.monitor.pause()
  assert.equal(h.calls.length, count)
  assert.equal(h.monitor.state.monitoring, false)
})

test('a delayed old binding lookup cannot restore or poll over a new selection', async () => {
  let completeOld: any, lookups = 0
  const calls: any[] = [], current = { ...target, projectId: 'new-project' }
  const monitor = createWorkbenchSessionMonitor({ pinParentSessionId: () => 'parent',
    api: (_path: string, _cwd: string, init: any) => {
      if (init.method === 'GET') {
        lookups++
        return lookups === 1 ? new Promise(resolve => { completeOld = resolve }) : Promise.resolve({ binding: { ...current, sessionId: 'parent' } })
      }
      calls.push(JSON.parse(init.body))
      return Promise.resolve({ runtime: { phase: 'waiting', reason: '新项目' } })
    }, setIntervalFn: () => 1, clearIntervalFn: () => {}, onChange: () => {} })
  const previous = monitor.restore(target, 'parent')
  assert.equal(await monitor.restore(current, 'parent'), true)
  await new Promise(resolve => setImmediate(resolve))
  completeOld({ binding: { ...target, sessionId: 'parent' } })
  assert.equal(await previous, false)
  assert.equal(monitor.state.projectId, 'new-project')
  assert.equal(monitor.state.note, '新项目')
  assert.ok(calls.every(row => row.projectId === 'new-project' && row.action === 'runtime_status'))
})

test('late errors from the same project ID in another module cannot overwrite the new runtime', async () => {
  let rejectOld: any, binding: any = { ...target, sessionId: 'parent' }
  const monitor = createWorkbenchSessionMonitor({ pinParentSessionId: () => 'parent',
    api: (_path: string, _cwd: string, init: any) => {
      if (init.method === 'GET') return Promise.resolve({ binding })
      const body = JSON.parse(init.body)
      return body.module === 'tender' ? new Promise((_resolve, reject) => { rejectOld = reject }) : Promise.resolve({ runtime: { phase: 'waiting', reason: '中国项目' } })
    }, setIntervalFn: () => 1, clearIntervalFn: () => {}, onChange: () => {} })
  await monitor.restore(target, 'parent')
  await new Promise(resolve => setImmediate(resolve))
  binding = { ...target, module: 'china-tender', sessionId: 'parent' }
  await monitor.restore({ ...target, module: 'china-tender' }, 'parent')
  await new Promise(resolve => setImmediate(resolve))
  rejectOld(new Error('旧南非项目绑定已变化'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(monitor.state.module, 'china-tender')
  assert.equal(monitor.state.note, '中国项目')
  assert.equal(monitor.state.monitoring, true)
})
