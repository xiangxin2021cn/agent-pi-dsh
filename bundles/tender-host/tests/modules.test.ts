import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateModuleFile, workflowToModuleFile } from '../src/modules.ts'
import { WORKFLOWS } from '../src/workflows.ts'

test('copying the tender workflow preserves professional review and human approval gates', () => {
  const file = workflowToModuleFile(WORKFLOWS.tender!, 'tender-copy', '投标流程副本')
  const validated = validateModuleFile(file)

  assert.equal(validated.controlProfile, 'tender')

  assert.deepEqual(
    validated.stages.filter((stage) => stage.approvalGate).map((stage) => stage.id),
    ['bid-risk-decision', 'pricing-basis-freeze', 'submission-compliance-freeze'],
  )
  assert.equal(
    validated.stages.find((stage) => stage.id === 'boq-five-step-pricing')?.reviewPolicy,
    'risk-based',
  )
  assert.equal(
    validated.stages.find((stage) => stage.id === 'pricing-basis-freeze')?.approvalGate?.approveLabelZh,
    '确认基准，开始组价',
  )
})

test('module validation rejects unknown review policies', () => {
  const file = workflowToModuleFile(WORKFLOWS.tender!, 'tender-review-bad', '错误审查策略')
  const stage = file.stages.find((item) => item.id === 'boq-five-step-pricing')!
  ;(stage as { reviewPolicy?: string }).reviewPolicy = 'random'

  assert.throws(() => validateModuleFile(file), /reviewPolicy 必须是 all \| risk-based/)
})

test('module validation requires complete approval gate labels', () => {
  const file = workflowToModuleFile(WORKFLOWS.tender!, 'tender-gate-bad', '错误审批门禁')
  const stage = file.stages.find((item) => item.id === 'pricing-basis-freeze')!
  stage.approvalGate = { promptZh: '请确认', approveLabelZh: '' }

  assert.throws(() => validateModuleFile(file), /approvalGate\.approveLabelZh 不能为空/)
})

test('tender control profile rejects a lookalike workflow that drops canonical hard-gate stages', () => {
  const file = workflowToModuleFile(WORKFLOWS.tender!, 'tender-lookalike', '伪投标流程')
  file.stages = file.stages.filter((stage) => stage.id !== 'submission-compliance-freeze')
  if (file.bindingAreaByStage) delete file.bindingAreaByStage['submission-compliance-freeze']

  assert.throws(
    () => validateModuleFile(file),
    /controlProfile=tender 必须保留内置投标阶段 id 及顺序/,
  )
})

test('copying a workflow preserves machine-readable stage dependencies', () => {
  const file = workflowToModuleFile(WORKFLOWS.tender!, 'tender-memory-copy', '投标记忆副本')
  const pricing = file.stages.find((stage) => stage.id === 'boq-five-step-pricing')
  assert.deepEqual(pricing?.consumes, WORKFLOWS.tender.stages.find((stage) => stage.id === 'boq-five-step-pricing')?.consumes)
  const normalized = validateModuleFile(file)
  assert.deepEqual(normalized.stages.find((stage) => stage.id === 'boq-five-step-pricing')?.consumes, pricing?.consumes)
})

test('module validation rejects a handoff dependency on the current or future stage', () => {
  assert.throws(() => validateModuleFile({
    schemaVersion: 1,
    id: 'bad-memory-order',
    labelZh: '错误依赖',
    stages: [
      { id: 'first', labelZh: '第一步', prompt: '先做', consumes: [{ kind: 'handoff', stageId: 'second' }] },
      { id: 'second', labelZh: '第二步', prompt: '再做' },
    ],
  }), /必须引用当前阶段之前的阶段/)
})
