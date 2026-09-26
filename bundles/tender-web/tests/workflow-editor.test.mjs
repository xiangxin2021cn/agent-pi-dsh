import assert from 'node:assert/strict'
import { test } from 'node:test'
import { patchWorkflowStage, workflowDependencyError, moveWorkflowStage, removeWorkflowStage, nextStageId } from '../src/client/workflow-editor.js'

const draft = () => ({ setupStageId: 'survey', stages: [
  { id: 'survey', labelZh: '勘察', consumes: [] },
  { id: 'report', labelZh: '报告', consumes: [{ kind: 'handoff', stageId: 'survey', required: true }] },
] })
test('renaming a stage updates setup and incoming dependencies without changing source', () => {
  const before = draft()
  const after = patchWorkflowStage(before, 0, { id: 'inspect' })
  assert.equal(after.setupStageId, 'inspect')
  assert.deepEqual(after.stages[1].consumes, [{ kind: 'handoff', stageId: 'inspect', required: true }])
  assert.equal(before.stages[1].consumes[0].stageId, 'survey')
})
test('reordering reports the exact forward dependency; independent stages can move', () => {
  assert.deepEqual(workflowDependencyError(moveWorkflowStage(draft(), 1, -1).stages), { stage: '报告', dependency: 'survey' })
  const independent = draft()
  independent.stages[1].consumes = []
  assert.equal(workflowDependencyError(moveWorkflowStage(independent, 1, -1).stages), null)
})
test('referenced stages cannot be deleted and deleting a leaf preserves the original', () => {
  const before = draft()
  assert.equal(removeWorkflowStage(before, 0), before)
  assert.equal(removeWorkflowStage(before, 1).stages.length, 1)
  assert.equal(before.stages.length, 2)
  assert.equal(nextStageId([{ id: 'stage-1' }, { id: 'stage-3' }]), 'stage-2')
})
