import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  buildParentWakePrompt,
  inboundNeedsParentWake,
  isChildReturnText,
  isWorkbenchWakeText,
  lastChildReturn,
  queuedMessages,
  snapshotIsBusy,
  snapshotIsRunning,
} from '../src/session-wake.ts'

test('queue-only is busy for crash-resume but not running', () => {
  const snap = { running: false, queue: [{ id: 'q1', placement: 'queued' }] }
  assert.equal(snapshotIsRunning(snap), false)
  assert.equal(snapshotIsBusy(snap), true)
  assert.deepEqual(queuedMessages(snap).map((item) => item.id), ['q1'])
  assert.deepEqual(queuedMessages({ running: true, queue: [{ id: 'x', placement: 'steering' }] }), [])
})

test('child return matches DONE, settlement, and review verdicts', () => {
  assert.equal(isChildReturnText('DONE 招标文件总结_N3Section1.md md行数=315'), true)
  assert.equal(isChildReturnText('Background subagent abc finished and will do no further work unless you send it more.'), true)
  assert.equal(isChildReturnText('Background subagent abc reported:\n成果已产出'), true)
  assert.equal(isChildReturnText('ACCEPT_AND_PROCEED\n可以收口'), true)
  assert.equal(isChildReturnText('还缺地质情况分析'), false)
})

test('lastChildReturn reads the newest matching user node', () => {
  const snap = {
    nodes: [
      { kind: 'assistant', blocks: [{ kind: 'text', text: '等 6 个 DONE 报告' }] },
      { kind: 'user', blocks: [{ kind: 'text', text: 'DONE 工程量清单分析.md md行数=222' }] },
    ],
  }
  assert.match(lastChildReturn(snap), /工程量清单分析/)
})

test('inboundNeedsParentWake is null when tools already ran after the inbound', () => {
  const snap = {
    nodes: [
      { kind: 'user', blocks: [{ kind: 'text', text: 'DONE a.md md行数=10' }] },
      { kind: 'tool', blocks: [{ kind: 'text', text: 'run_code' }] },
    ],
  }
  assert.equal(inboundNeedsParentWake(snap), null)
})

test('inboundNeedsParentWake is null when the parent already replied', () => {
  const snap = {
    nodes: [
      { kind: 'user', blocks: [{ kind: 'text', text: 'DONE a.md md行数=10' }] },
      { kind: 'assistant', blocks: [{ kind: 'text', text: '已核验，继续组价' }] },
    ],
  }
  assert.equal(inboundNeedsParentWake(snap), null)
})

test('inboundNeedsParentWake fires when a child return is last', () => {
  const snap = {
    nodes: [
      { kind: 'assistant', blocks: [{ kind: 'text', text: '等 6 个 DONE 报告后再核磁盘' }] },
      { kind: 'user', blocks: [{ kind: 'text', text: 'Background subagent abcd finished and will do no further work unless you send it more.\nDONE 招标文件总结.md md行数=315' }] },
    ],
  }
  const hit = inboundNeedsParentWake(snap)
  assert.ok(hit)
  assert.equal(hit.kind, 'child-return')
  assert.match(buildParentWakePrompt(hit), /子代理回推/)
  assert.match(buildParentWakePrompt(hit), /不要再空等/)
})

test('workbench wake text is not treated as another unanswered inbound', () => {
  assert.equal(isWorkbenchWakeText('【子代理回推】子智能体已 report/settled。\n\nDONE a.md md行数=10'), true)
  const snap = {
    nodes: [
      { kind: 'user', blocks: [{ kind: 'text', text: 'DONE a.md md行数=10' }] },
      { kind: 'user', blocks: [{ kind: 'text', text: '【子代理回推】子智能体已 report/settled。请立刻核验磁盘成果并继续本阶段，不要再空等 DONE。\n\nDONE a.md md行数=10' }] },
    ],
  }
  assert.equal(inboundNeedsParentWake(snap), null)
})

test('inboundNeedsParentWake fires when a human user message is last', () => {
  const snap = {
    nodes: [
      { kind: 'assistant', blocks: [{ kind: 'text', text: '等 6 个 DONE' }] },
      { kind: 'user', blocks: [{ kind: 'text', text: '你检查一下我看6个子代理都停止工作了' }] },
    ],
  }
  const hit = inboundNeedsParentWake(snap)
  assert.ok(hit)
  assert.equal(hit.kind, 'user')
  assert.match(buildParentWakePrompt(hit), /主对话未接续/)
  assert.match(buildParentWakePrompt(hit), /6个子代理都停止/)
})

test('client monitor wires queue steer and parent wake', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
  assert.match(page, /inboundNeedsParentWake/)
  assert.match(page, /flushQueuedToParent/)
  assert.match(page, /buildParentWakePrompt/)
  assert.match(page, /parentWakeEngine/)
  assert.match(page, /updateQueue/)
  assert.match(page, /snapshotIsRunning\(snapshotOf\(targetId\)\) \? 'steer' : 'queue'/)
  assert.match(page, /action: 'resume', module: st\.module, projectId: st\.projectId, sessionId: parentId/)
  assert.match(page, /sessionId: resolveSessionId\(props\) \|\| runtime\.sessionId \|\| 'active'/)
  const runtimeAt = page.indexOf('const runtime = {')
  const loadAt = page.indexOf('parentWakeEngine.load()')
  assert.ok(runtimeAt >= 0 && loadAt > runtimeAt, 'parentWakeEngine.load() must run after const runtime')
})
