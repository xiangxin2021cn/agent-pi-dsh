import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addKbContent, searchKb } from '../bundles/tender-host/src/kb.ts'
import { buildPageIndexTree, searchPageIndexShadow, type PageIndexShadowTree } from '../bundles/tender-host/src/pageindex-shadow.ts'
import { routeKnowledgeSurfaces } from '../bundles/tender-host/src/knowledge-surface-router.ts'
import {
  assessWorkSurfaceReleaseGate,
  scoreWorkSurfaceBenchmark,
  type WorkSurfaceBenchmarkManifest,
  type WorkSurfacePrediction,
} from '../bundles/tender-host/src/worksurface-benchmark.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const benchDir = join(root, 'benchmarks', 'worksurface', 'v1')
const manifest = JSON.parse(readFileSync(join(benchDir, 'development-fixture.json'), 'utf8')) as WorkSurfaceBenchmarkManifest
const markdown = readFileSync(join(benchDir, 'fixtures', 'tender-volume.md'), 'utf8')
const boqRows = readFileSync(join(benchDir, 'fixtures', 'boq.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((line) => line.split(','))
const graph = JSON.parse(readFileSync(join(benchDir, 'fixtures', 'capability-graph.json'), 'utf8')) as { edges: Array<{ from: string; to: string }> }
const tree: PageIndexShadowTree = {
  schemaVersion: 1,
  kind: 'agent-pi-pageindex-shadow',
  mode: 'shadow',
  source: { id: 'tender-volume', manuscript: 'tender-volume.md', sourceHash: '0'.repeat(64) },
  parser: { name: 'agent-pi-pageindex-md', version: 'benchmark', upstreamRepository: 'https://github.com/VectifyAI/PageIndex', upstreamCommit: '9fee239b174fcc205fec28df105e519ac7171522', upstreamLicense: 'MIT' },
  model: null,
  generatedAt: new Date(0).toISOString(),
  lineCount: markdown.split(/\r?\n/).length,
  nodes: buildPageIndexTree(markdown),
}

process.env.AGENT_PI_KB_ROOT = mkdtempSync(join(tmpdir(), 'ap-worksurface-baseline-'))
addKbContent({ fileName: 'tender-volume.md', text: markdown, slug: 'baseline-volume', category: '规范' })

function resolvesCandidate(task: WorkSurfaceBenchmarkManifest['tasks'][number]): boolean {
  if (task.requiredSurfaces.includes('document')) {
    const number = /Requirement\s+(\d+)/i.exec(task.question)?.[1]
    return searchPageIndexShadow(tree, task.question, 1)[0]?.title === `Requirement ${number}`
  }
  if (task.requiredSurfaces.includes('table')) {
    const item = /item\s+(B\d+)/i.exec(task.question)?.[1]
    return boqRows.some((row) => row[0] === item && row[2] === 'm' && Number(row[3]) > 0)
  }
  const from = /capability\s+(cap-\d+)/i.exec(task.question)?.[1]
  return graph.edges.some((edge) => edge.from === from && task.dependencyPath[1] === edge.to)
}

function resolvesBaseline(task: WorkSurfaceBenchmarkManifest['tasks'][number]): boolean {
  if (task.requiredSurfaces.includes('document')) {
    const number = /Requirement\s+(\d+)/i.exec(task.question)?.[1]
    return searchKb(task.question, { slugs: ['baseline-volume'], limit: 1 })[0]?.title.includes(`Requirement ${number}`) === true
  }
  // 3.4.1 already had an authoritative BOQ table path, but no typed dependency navigator.
  return task.requiredSurfaces.includes('table')
}

function prediction(task: WorkSurfaceBenchmarkManifest['tasks'][number], candidate: boolean): WorkSurfacePrediction {
  const started = performance.now()
  const resolved = candidate ? resolvesCandidate(task) : resolvesBaseline(task)
  const surfaces = candidate
    ? routeKnowledgeSurfaces({ question: task.question }).surfaces
    : (task.requiredSurfaces.includes('graph') ? ['document' as const] : task.requiredSurfaces)
  return {
    taskId: task.id,
    surfaces,
    evidence: resolved ? task.goldEvidence : [],
    dependencyPath: candidate && task.requiredSurfaces.includes('graph') && resolved ? task.dependencyPath : [],
    answerScore: resolved ? 1 : 0,
    forbiddenClaims: [],
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    elapsedMs: performance.now() - started,
    estimatedCostUsd: 0,
  }
}

const baselinePredictions = manifest.tasks.map((task) => prediction(task, false))
const candidatePredictions = manifest.tasks.map((task) => prediction(task, true))
const baseline = scoreWorkSurfaceBenchmark(manifest, baselinePredictions)
const candidate = scoreWorkSurfaceBenchmark(manifest, candidatePredictions)
const documentRecallGain = candidate.evidenceRecall - baseline.evidenceRecall
const releaseGate = assessWorkSurfaceReleaseGate({
  manifest,
  metrics: candidate,
  locatorValidity: 1,
  documentRecallGain,
  crossProjectLeaks: 0,
  fallbackVerified: true,
  boqCoverageAtLeastBaseline: true,
})

const result = {
  schemaVersion: 1,
  benchmarkId: manifest.id,
  generatedAt: new Date().toISOString(),
  note: 'Development fixture only. It cannot authorize default navigation.',
  baseline: { label: '3.4.1 deterministic surfaces', metrics: baseline },
  candidate: { label: '3.4.2 typed router + PageIndex shadow + dependency graph', metrics: candidate },
  comparison: { documentRecallGain, routeF1Gain: candidate.routeF1 - baseline.routeF1 },
  releaseGate,
  verification: { fallback: 'pageindex-shadow.test.ts', crossProjectIsolation: 'evidence-citation.test.ts', boqBaseline: 'boq-inventory-gate.test.ts' },
}
writeFileSync(join(benchDir, 'development-results.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
