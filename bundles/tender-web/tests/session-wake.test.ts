import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  assistantNeedsTransactionContinuation,
  buildParentWakePrompt,
  inboundNeedsParentWake,
  isChildReturnText,
  isWorkbenchWakeText,
  lastChildReturn,
  parentSessionTarget,
  queuedMessages,
  sessionActivity,
  sessionExecutionActive,
  sessionNodes,
  snapshotIsBusy,
  snapshotIsRunning,
} from '../src/session-wake.ts'
import { clientSource } from './client-source.ts'

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

test('child return recognizes every DSH settlement outcome', () => {
  assert.equal(isChildReturnText('Background subagent abc was stopped before it finished.'), true)
  assert.equal(isChildReturnText('Background subagent abc ran out of room before it finished.'), true)
  assert.equal(isChildReturnText('Background subagent abc declined the task.'), true)
  assert.equal(isChildReturnText('Background subagent abc failed before it finished.'), true)
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

test('lastChildReturn ignores a stale return after later child activity', () => {
  const snap = {
    nodes: [
      { kind: 'assistant', blocks: [{ kind: 'text', text: 'DONE 初稿.md md行数=120' }] },
      { kind: 'user', blocks: [{ kind: 'text', text: '请继续修订第二章' }] },
      { kind: 'assistant', blocks: [{ kind: 'text', text: '正在修订，尚未交付' }] },
    ],
  }
  assert.equal(lastChildReturn(snap), '')
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

test('inboundNeedsParentWake recognizes DSH subagent context nodes', () => {
  const snap = {
    nodes: [
      { kind: 'assistant', blocks: [{ kind: 'text', text: '等待后台分析' }] },
      {
        kind: 'context',
        blocks: [{ kind: 'text', text: 'Background subagent child-1 reported:\nDONE 招标文件总结.md md行数=315' }],
      },
    ],
  }
  const hit = inboundNeedsParentWake(snap)
  assert.ok(hit)
  assert.equal(hit.kind, 'child-return')
})

test('parentSessionTarget routes workbench actions from a child back to its parent', () => {
  assert.equal(parentSessionTarget('child-1', {
    subagent: { address: { parentSessionId: 'parent-1' } },
  }), 'parent-1')
  assert.equal(parentSessionTarget('parent-1', { subagent: null }), 'parent-1')
})

test('parentSessionTarget climbs from a nested worker to the main session', () => {
  const list = {
    byId: {
      parent: { id: 'parent', running: false },
      child: { id: 'child', origin: 'subagent', parentId: 'parent', running: false },
      grandchild: { id: 'grandchild', origin: 'subagent', parentId: 'child', running: true },
    },
  }
  assert.equal(parentSessionTarget('grandchild', {
    subagent: { address: { parentSessionId: 'child' } },
  }, list), 'parent')
})

test('sessionActivity projects nested DSH subagent execution under the main session', () => {
  const list = {
    byId: {
      parent: { id: 'parent', running: false },
      child1: { id: 'child1', origin: 'subagent', parentId: 'parent', running: true },
      child2: { id: 'child2', origin: 'subagent', parentId: 'parent', running: false },
      grandchild: { id: 'grandchild', origin: 'subagent', parentId: 'child1', running: true },
      fork: { id: 'fork', parentId: 'parent', running: true },
    },
  }
  assert.deepEqual(sessionActivity(list, 'parent'), {
    parentRunning: false,
    childCount: 3,
    runningChildCount: 2,
  })
  assert.equal(sessionExecutionActive({ running: false }, list, 'parent'), true)
  assert.equal(sessionExecutionActive(null, { byId: { parent: { id: 'parent', running: true } } }, 'parent'), true)
  assert.equal(sessionExecutionActive({ running: false }, { byId: {} }, 'parent'), false)
})

test('workbench wake text is not treated as another unanswered inbound', () => {
  for (const text of [
    '【子代理回推】子智能体已 report/settled。\n\nDONE a.md md行数=10',
    '【主对话未接续】用户已提交指令。',
    '【主对话插话】请继续。',
    '【评审回推】ACCEPT_AND_PROCEED',
    '【事务自动接续】本会话事务仍有效。',
  ]) {
    assert.equal(isWorkbenchWakeText(text), true)
  }
  const snap = {
    nodes: [
      { kind: 'user', blocks: [{ kind: 'text', text: 'DONE a.md md行数=10' }] },
      { kind: 'user', blocks: [{ kind: 'text', text: '【子代理回推】子智能体已 report/settled。请立刻核验磁盘成果并继续本阶段，不要再空等 DONE。\n\nDONE a.md md行数=10' }] },
    ],
  }
  assert.equal(inboundNeedsParentWake(snap), null)
})

test('official Chat legacy slice is authoritative over removed SessionSnapshot.nodes', () => {
  const stale = { kind: 'assistant', blocks: [{ kind: 'text', text: 'stale' }] }
  const current = { kind: 'user', content: [{ type: 'text', text: 'DONE official.md md行数=10' }] }
  const snap = { nodes: [stale], chat: { legacy: { nodes: [current] } } }
  assert.deepEqual(sessionNodes(snap), [current])
  assert.match(lastChildReturn(snap), /official\.md/)
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

test('assistant mechanical batching question is resumed inside a committed transaction', () => {
  const snap = {
    nodes: [
      { kind: 'assistant', blocks: [{ kind: 'text', text: '我继续以小批次 workflow 补全其余计量项五步组价，直至 complete_stage(tender-document-analysis)。是否按此继续？' }] },
    ],
  }
  const hit = assistantNeedsTransactionContinuation(snap)
  assert.ok(hit)
  assert.equal(hit.kind, 'transaction-continuation')
  assert.match(buildParentWakePrompt(hit), /事务自动接续/)
})

test('assistant human approval question is never resumed automatically', () => {
  for (const text of [
    '存在重大履约风险，请人工决定是否投标？',
    '价格基准已经形成，是否确认冻结并进入详细组价？',
    '最终投标文件已经完成，是否批准提交？',
  ]) {
    assert.equal(assistantNeedsTransactionContinuation({
      nodes: [{ kind: 'assistant', blocks: [{ kind: 'text', text }] }],
    }), null)
  }
})

test('client monitor only observes an explicitly dispatched transaction and never auto-resumes', () => {
  const page = clientSource
  const here = dirname(fileURLToPath(import.meta.url))
  const monitor = readFileSync(join(here, '../src/client/session-monitor.js'), 'utf8')
  assert.match(page, /createWorkbenchSessionMonitor/)
  assert.match(page, /if \(isWorkbenchWakeText\(clean\)\) return ''/)
  assert.match(page, /inboundNeedsParentWake/)
  assert.match(page, /flushQueuedToParent/)
  assert.match(page, /buildParentWakePrompt/)
  assert.match(page, /workbenchTransactions/)
  assert.match(page, /prepareWorkbenchTransaction/)
  assert.match(page, /commitWorkbenchTransaction/)
  assert.match(monitor, /transactionCanRun\(parentId\)/)
  assert.match(page, /updateQueue/)
  assert.match(page, /snapshotIsRunning\(snapshotOf\(targetId\)\) \? 'steer' : 'queue'/)
  assert.match(monitor, /action: 'check', module: state\.module, projectId: state\.projectId, sessionId: parentId/)
  assert.match(monitor, /if \(!state\.settlementCheckPending && !state\.observedExecutionActive\) return undefined/)
  assert.doesNotMatch(monitor, /action: 'resume'|action: 'mark_dispatched'|dispatchToConversation/)
  assert.match(page, /const parentSessionId = pinParentSessionId\(\)/)
  assert.match(page, /sessionExecutionActive\(parentSnap, sessionList, parentId\)/)
  assert.match(page, /ap-wb-session-transactions:v1/)
  assert.match(page, /monitorEngine\.restore/)
  assert.match(page, /if \(result\.alreadyDispatched\) \{[\s\S]{0,300}monitorEngine\.start/)
  assert.match(page, /sessionActivity\(readSessionListSnap\(\), monitorState\.parentSessionId\)/)
  assert.match(page, /h\(KnowledgeBasePanel, \{ cwd, sessionId: pinParentSessionId\(\) \|\| resolveSessionId\(props\)/)
  assert.match(page, /sessionId: parentId \|\| resolveSessionId\(props\) \|\| runtime\.sessionId \|\| 'active'/)
  assert.doesNotMatch(page, /monitorEngine\.load\(\)/)
  assert.doesNotMatch(page, /crashResumeEngine\.load\(\)/)
  assert.doesNotMatch(page, /parentWakeEngine\.load\(\)/)
})
