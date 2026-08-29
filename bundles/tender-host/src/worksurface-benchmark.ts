import type { KnowledgeSurface } from './knowledge-surface-router.ts'

export interface WorkSurfaceTask {
  id: string
  question: string
  requiredSurfaces: KnowledgeSurface[]
  goldEvidence: string[]
  dependencyPath: string[]
  answerRubric: string[]
  forbiddenClaims: string[]
}

export interface WorkSurfacePrediction {
  taskId: string
  surfaces: KnowledgeSurface[]
  evidence: string[]
  dependencyPath?: string[]
  answerScore: number
  forbiddenClaims?: string[]
  modelCalls?: number
  inputTokens?: number
  outputTokens?: number
  elapsedMs?: number
  estimatedCostUsd?: number
}

export interface WorkSurfaceBenchmarkManifest {
  schemaVersion: 1
  id: string
  provenance: 'development-fixture' | 'audited-real-project'
  goldReviewedByHumans: boolean
  tasks: WorkSurfaceTask[]
}

export interface WorkSurfaceMetrics {
  taskCount: number
  routeF1: number
  evidencePrecision: number
  evidenceRecall: number
  dependencyPathAccuracy: number
  answerScore: number
  forbiddenClaimRate: number
  modelCalls: number
  inputTokens: number
  outputTokens: number
  elapsedMs: number
  estimatedCostUsd: number
}

export interface WorkSurfaceReleaseGate {
  eligibleForDefault: boolean
  failures: string[]
  requirements: {
    minimumTasks: number
    routeF1: number
    locatorValidity: number
    unsupportedCriticalClaimRate: number
    documentRecallGain: number
  }
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator
}

function setCounts(gold: string[], predicted: string[]): { tp: number; fp: number; fn: number } {
  const expected = new Set(gold)
  const actual = new Set(predicted)
  let tp = 0
  for (const value of actual) if (expected.has(value)) tp++
  return { tp, fp: actual.size - tp, fn: expected.size - tp }
}

export function validateWorkSurfaceManifest(manifest: WorkSurfaceBenchmarkManifest): string[] {
  const errors: string[] = []
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (!manifest.id.trim()) errors.push('id is required')
  const ids = new Set<string>()
  for (const [index, task] of manifest.tasks.entries()) {
    const at = `tasks[${index}]`
    if (!task.id || ids.has(task.id)) errors.push(`${at}.id must be unique`)
    ids.add(task.id)
    if (!task.question.trim()) errors.push(`${at}.question is required`)
    if (task.requiredSurfaces.length === 0) errors.push(`${at}.requiredSurfaces is empty`)
    if (task.goldEvidence.length === 0) errors.push(`${at}.goldEvidence is empty`)
    if (task.answerRubric.length === 0) errors.push(`${at}.answerRubric is empty`)
    if (task.requiredSurfaces.includes('graph') && task.dependencyPath.length < 2) errors.push(`${at}.dependencyPath is required for graph tasks`)
    if (task.requiredSurfaces.includes('table') && !task.goldEvidence.some((item) => /![A-Z]+\d+/i.test(item))) {
      errors.push(`${at}.goldEvidence needs a sheet/cell locator`)
    }
    if (task.requiredSurfaces.includes('document') && !task.goldEvidence.some((item) => /(?:page|#L|tree:)/i.test(item))) {
      errors.push(`${at}.goldEvidence needs a page/line/tree locator`)
    }
  }
  return errors
}

export function scoreWorkSurfaceBenchmark(
  manifest: WorkSurfaceBenchmarkManifest,
  predictions: WorkSurfacePrediction[],
): WorkSurfaceMetrics {
  const invalid = validateWorkSurfaceManifest(manifest)
  if (invalid.length) throw new Error(`WorkSurface benchmark invalid: ${invalid.join('; ')}`)
  const byTask = new Map(predictions.map((prediction) => [prediction.taskId, prediction]))
  let routeTp = 0
  let routeFp = 0
  let routeFn = 0
  let evidenceTp = 0
  let evidenceFp = 0
  let evidenceFn = 0
  let dependencyCorrect = 0
  let dependencyTotal = 0
  let answerTotal = 0
  let forbidden = 0
  let forbiddenTotal = 0
  let modelCalls = 0
  let inputTokens = 0
  let outputTokens = 0
  let elapsedMs = 0
  let estimatedCostUsd = 0
  for (const task of manifest.tasks) {
    const prediction = byTask.get(task.id)
    const route = setCounts(task.requiredSurfaces, prediction?.surfaces ?? [])
    routeTp += route.tp
    routeFp += route.fp
    routeFn += route.fn
    const evidence = setCounts(task.goldEvidence, prediction?.evidence ?? [])
    evidenceTp += evidence.tp
    evidenceFp += evidence.fp
    evidenceFn += evidence.fn
    if (task.dependencyPath.length > 0) {
      dependencyTotal++
      if (JSON.stringify(task.dependencyPath) === JSON.stringify(prediction?.dependencyPath ?? [])) dependencyCorrect++
    }
    answerTotal += Math.max(0, Math.min(1, Number(prediction?.answerScore) || 0))
    forbidden += prediction?.forbiddenClaims?.length ?? 0
    forbiddenTotal += Math.max(1, task.forbiddenClaims.length)
    modelCalls += prediction?.modelCalls ?? 0
    inputTokens += prediction?.inputTokens ?? 0
    outputTokens += prediction?.outputTokens ?? 0
    elapsedMs += prediction?.elapsedMs ?? 0
    estimatedCostUsd += prediction?.estimatedCostUsd ?? 0
  }
  const precision = ratio(routeTp, routeTp + routeFp)
  const recall = ratio(routeTp, routeTp + routeFn)
  return {
    taskCount: manifest.tasks.length,
    routeF1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    evidencePrecision: ratio(evidenceTp, evidenceTp + evidenceFp),
    evidenceRecall: ratio(evidenceTp, evidenceTp + evidenceFn),
    dependencyPathAccuracy: ratio(dependencyCorrect, dependencyTotal),
    answerScore: ratio(answerTotal, manifest.tasks.length),
    forbiddenClaimRate: ratio(forbidden, forbiddenTotal),
    modelCalls,
    inputTokens,
    outputTokens,
    elapsedMs,
    estimatedCostUsd,
  }
}

export function assessWorkSurfaceReleaseGate(input: {
  manifest: WorkSurfaceBenchmarkManifest
  metrics: WorkSurfaceMetrics
  locatorValidity: number
  documentRecallGain: number
  crossProjectLeaks: number
  fallbackVerified: boolean
  boqCoverageAtLeastBaseline: boolean
}): WorkSurfaceReleaseGate {
  const requirements = {
    minimumTasks: 80,
    routeF1: 0.95,
    locatorValidity: 1,
    unsupportedCriticalClaimRate: 0.01,
    documentRecallGain: 0.10,
  }
  const failures: string[] = []
  if (input.manifest.provenance !== 'audited-real-project') failures.push('评测集不是经审校的真实项目任务')
  if (!input.manifest.goldReviewedByHumans) failures.push('gold evidence 未经人工复核')
  if (input.metrics.taskCount < requirements.minimumTasks) failures.push(`原子任务少于 ${requirements.minimumTasks}`)
  if (input.metrics.routeF1 < requirements.routeF1) failures.push(`Route F1 ${input.metrics.routeF1.toFixed(3)} < ${requirements.routeF1}`)
  if (input.locatorValidity < requirements.locatorValidity) failures.push('证据定位有效率不是 100%')
  if (input.metrics.forbiddenClaimRate > requirements.unsupportedCriticalClaimRate) failures.push('无依据关键主张超过 1%')
  if (input.documentRecallGain < requirements.documentRecallGain) failures.push('文档召回提升不足 10 个百分点')
  if (input.crossProjectLeaks !== 0) failures.push('存在跨项目串库')
  if (!input.fallbackVerified) failures.push('影子索引关闭/损坏回退未通过')
  if (!input.boqCoverageAtLeastBaseline) failures.push('BOQ 行/数量/单位/单元格覆盖低于基线')
  return { eligibleForDefault: failures.length === 0, failures, requirements }
}
