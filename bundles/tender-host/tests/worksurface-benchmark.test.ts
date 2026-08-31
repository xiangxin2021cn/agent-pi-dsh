import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assessWorkSurfaceReleaseGate,
  scoreWorkSurfaceBenchmark,
  validateWorkSurfaceManifest,
  type WorkSurfaceBenchmarkManifest,
} from '../src/worksurface-benchmark.ts'

function auditedFixture(provenance: WorkSurfaceBenchmarkManifest['provenance'] = 'audited-real-project'): WorkSurfaceBenchmarkManifest {
  const surfaces = ['document', 'table', 'graph', 'document'] as const
  return {
    schemaVersion: 1,
    id: 'worksurface-v1-test',
    provenance,
    goldReviewedByHumans: true,
    tasks: Array.from({ length: 96 }, (_, index) => {
      const surface = surfaces[index % surfaces.length]!
      return {
        id: `task-${String(index + 1).padStart(3, '0')}`,
        question: `Audited atomic question ${index + 1}`,
        requiredSurfaces: [surface],
        goldEvidence: surface === 'table' ? [`BOQ!B${index + 2}`] : surface === 'document' ? [`Volume.pdf#L${index + 2}`] : [`graph:path-${index}`],
        dependencyPath: surface === 'graph' ? ['addendum-3', 'spec-rev-a'] : [],
        answerRubric: ['exact audited fact'],
        forbiddenClaims: ['unsupported conclusion'],
      }
    }),
  }
}

test('scores 96 atomic document/table/graph tasks and opens the release gate only at all thresholds', () => {
  const manifest = auditedFixture()
  assert.deepEqual(validateWorkSurfaceManifest(manifest), [])
  const predictions = manifest.tasks.map((task) => ({
    taskId: task.id,
    surfaces: task.requiredSurfaces,
    evidence: task.goldEvidence,
    dependencyPath: task.dependencyPath,
    answerScore: 1,
    forbiddenClaims: [],
    modelCalls: 1,
    inputTokens: 100,
    outputTokens: 20,
    elapsedMs: 50,
    estimatedCostUsd: 0.001,
  }))
  const metrics = scoreWorkSurfaceBenchmark(manifest, predictions)
  assert.equal(metrics.routeF1, 1)
  assert.equal(metrics.evidenceRecall, 1)
  const gate = assessWorkSurfaceReleaseGate({
    manifest,
    metrics,
    locatorValidity: 1,
    documentRecallGain: 0.11,
    crossProjectLeaks: 0,
    fallbackVerified: true,
    boqCoverageAtLeastBaseline: true,
  })
  assert.equal(gate.eligibleForDefault, true)
})

test('development fixtures can measure code but cannot enable default navigation', () => {
  const manifest = auditedFixture('development-fixture')
  const metrics = scoreWorkSurfaceBenchmark(manifest, manifest.tasks.map((task) => ({
    taskId: task.id,
    surfaces: task.requiredSurfaces,
    evidence: task.goldEvidence,
    dependencyPath: task.dependencyPath,
    answerScore: 1,
  })))
  const gate = assessWorkSurfaceReleaseGate({ manifest, metrics, locatorValidity: 1, documentRecallGain: 1, crossProjectLeaks: 0, fallbackVerified: true, boqCoverageAtLeastBaseline: true })
  assert.equal(gate.eligibleForDefault, false)
  assert.match(gate.failures.join(' '), /真实项目/)
})
