// Pure editor operations. Keep references intact while the user changes a workflow.
export function patchWorkflowStage(draft, index, patch) {
  const oldId = draft.stages[index].id
  const stages = draft.stages.map((stage, i) => {
    const next = i === index ? { ...stage, ...patch } : { ...stage }
    if (patch.id !== undefined && Array.isArray(next.consumes)) {
      next.consumes = next.consumes.map((item) => item.kind === 'handoff' && item.stageId === oldId
        ? { ...item, stageId: patch.id } : item)
    }
    return next
  })
  return { ...draft, stages, setupStageId: patch.id !== undefined && draft.setupStageId === oldId ? patch.id : draft.setupStageId }
}

export function workflowDependencyError(stages) {
  const seen = new Set()
  for (const stage of stages) {
    for (const item of stage.consumes || []) {
      if (item.kind === 'handoff' && !seen.has(item.stageId)) return { stage: stage.labelZh || stage.id, dependency: item.stageId }
    }
    seen.add(stage.id)
  }
  return null
}

export function moveWorkflowStage(draft, index, delta) {
  const dest = index + delta
  if (dest < 0 || dest >= draft.stages.length) return draft
  const stages = draft.stages.slice()
  const [stage] = stages.splice(index, 1)
  stages.splice(dest, 0, stage)
  return { ...draft, stages }
}

export function stageDependents(draft, id) {
  return draft.stages.filter((stage) => (stage.consumes || []).some((item) => item.kind === 'handoff' && item.stageId === id))
}

export function removeWorkflowStage(draft, index) {
  if (draft.stages.length <= 1 || stageDependents(draft, draft.stages[index].id).length) return draft
  const stages = draft.stages.filter((_, i) => i !== index)
  return { ...draft, stages, setupStageId: draft.setupStageId === draft.stages[index].id ? stages[0].id : draft.setupStageId }
}

export function nextStageId(stages) {
  const ids = new Set(stages.map((stage) => stage.id))
  for (let n = 1; ; n++) if (!ids.has('stage-' + n)) return 'stage-' + n
}
