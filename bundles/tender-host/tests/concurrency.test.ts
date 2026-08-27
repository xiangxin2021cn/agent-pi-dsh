import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import { PRODUCT_LIVE_WORKER_CAP, liveWorkerLimitLineZh } from '../src/concurrency.ts'
import { buildStageDraft } from '../src/orchestration.ts'
import { WORKFLOWS } from '../src/workflows.ts'
import { removeProductParallelCap } from '../../../scripts/heal-agent-loop-settings.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

test('product does not cap live workers', () => {
  assert.equal(PRODUCT_LIVE_WORKER_CAP, null)
  assert.match(liveWorkerLimitLineZh(), /dsh 原生 subagent/)
  assert.doesNotMatch(liveWorkerLimitLineZh(), /同时最多 4/)
  assert.doesNotMatch(liveWorkerLimitLineZh(), /等一个回来再派下一个/)
  assert.match(liveWorkerLimitLineZh(), /滚动池/)
  const init = readFileSync(join(root, 'scripts/init-tender-profile.mjs'), 'utf8')
  assert.doesNotMatch(init, /maxParallelToolCalls:\s*4/)
  assert.doesNotMatch(init, /ensureParallelToolCalls/)
  assert.match(init, /removeProductParallelCap/)
})

test('analysis and pricing prompts use native fan-out', () => {
  const analysis = WORKFLOWS.tender.stages.find((stage) => stage.id === 'tender-document-analysis')
  const pricing = WORKFLOWS.tender.stages.find((stage) => stage.id === 'boq-five-step-pricing')
  const delivery = WORKFLOWS.delivery.stages.find((stage) => stage.id === 'delivery-controls')
  const investment = WORKFLOWS.investment.stages.find((stage) => stage.id === 'investment-diligence')
  for (const prompt of [analysis?.prompt, pricing?.prompt, delivery?.prompt, investment?.prompt]) {
    assert.doesNotMatch(prompt ?? '', /同时最多 4 个活工人/)
    assert.doesNotMatch(prompt ?? '', /等一个回来再派下一个/)
    assert.match(prompt ?? '', /dsh 原生 subagent/)
  }
  assert.match(pricing?.prompt ?? '', /web_search/)
  assert.match(pricing?.prompt ?? '', /action=schema/)
  assert.match(pricing?.prompt ?? '', /rateBasis/)
  assert.match(pricing?.prompt ?? '', /anysearch_batch_search/)
  assert.match(pricing?.prompt ?? '', /anysearch_capabilities/)
  assert.match(pricing?.prompt ?? '', /zone=intl/)
  assert.match(pricing?.prompt ?? '', /BCCEI/)
  assert.match(pricing?.prompt ?? '', /当地供应商尽调/)
  assert.match(pricing?.prompt ?? '', /当地工效尽调/)
  assert.match(pricing?.prompt ?? '', /询价单/)
  assert.match(pricing?.prompt ?? '', /waive_pricing/)
  assert.match(analysis?.prompt ?? '', /boq_reconciliation/)
  assert.match(analysis?.prompt ?? '', /没有清单/)
})

test('stage draft tells writers to report DONE and not sit idle', () => {
  const stage = WORKFLOWS.tender.stages.find((item) => item.id === 'tender-document-analysis')
  assert.ok(stage)
  const project: BusinessProjectRecord = {
    schemaVersion: 1,
    projectId: 'p1',
    module: 'tender',
    name: 'Demo',
    rootPath: process.cwd(),
    workflowId: 'tender-main',
    inputPaths: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const draft = buildStageDraft(project, stage)
  assert.match(draft, /DONE 文件名 md行数/)
  assert.match(draft, /不要结束本轮空等 DONE/)
  assert.match(draft, /dsh 原生 subagent/)
  assert.match(draft, /boq_reconciliation/)
  assert.match(draft, /没有清单/)
  assert.doesNotMatch(draft, /同时最多 4 个活工人/)
})

test('pricing draft names schema and market-rate search', () => {
  const stage = WORKFLOWS.tender.stages.find((item) => item.id === 'boq-five-step-pricing')
  assert.ok(stage)
  const project: BusinessProjectRecord = {
    schemaVersion: 1,
    projectId: 'p1',
    module: 'tender',
    name: 'Demo',
    rootPath: process.cwd(),
    workflowId: 'tender-main',
    inputPaths: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const draft = buildStageDraft(project, stage)
  assert.match(draft, /action=schema/)
  assert.match(draft, /web_search/)
  assert.match(draft, /webEvidence/)
  assert.match(draft, /webDiligenceAuthorized/)
  assert.match(draft, /anysearch_batch_search/)
  assert.match(draft, /anysearch_capabilities/)
  assert.match(draft, /zone=intl/)
  assert.match(draft, /BCCEI/)
  assert.match(draft, /当地供应商尽调/)
  assert.match(draft, /当地工效尽调/)
  assert.match(draft, /企业登记文件/)
  assert.match(draft, /人工复核/)
  assert.match(draft, /询价单/)
  assert.match(draft, /waive_pricing/)
  assert.doesNotMatch(draft, /把 R250 抄进本标/)
})

test('settings healer drops only the product stamp of 4', () => {
  const stamped = 'agent-loop:\n  maxParallelToolCalls: 4\nagent-default-model:\n  model: x\n'
  assert.doesNotMatch(removeProductParallelCap(stamped), /maxParallelToolCalls/)
  assert.match(removeProductParallelCap(stamped), /agent-default-model/)
  const userSet = 'agent-loop:\n  maxParallelToolCalls: 2\n'
  assert.match(removeProductParallelCap(userSet), /maxParallelToolCalls: 2/)
  const mixed = 'agent-loop:\n  maxParallelToolCalls: 4\n  other: 1\n'
  const healed = removeProductParallelCap(mixed)
  assert.doesNotMatch(healed, /maxParallelToolCalls/)
  assert.match(healed, /other: 1/)
})
