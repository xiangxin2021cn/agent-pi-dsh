import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildTenderKnowledgeGraph, traceKnowledgeGraph } from '../src/knowledge-graph.ts'
import { initTenderWorkspace, loadWorkspace, upsertWorkspaceSection } from '../src/workspace.ts'

test('derives document supersession and capability dependency paths from authoritative workspace state', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-knowledge-graph-'))
  initTenderWorkspace(cwd, 'p1', { id: 'p1', title: 'P1' })
  upsertWorkspaceSection(cwd, 'p1', {
    documents: [
      { id: 'addendum-2', name: 'Addendum 2', path: join(cwd, 'a2.pdf'), kind: 'addendum', status: 'active', supersedesIds: ['spec-rev-a'] },
      { id: 'spec-rev-a', name: 'Specification Rev A', path: join(cwd, 'spec.pdf'), kind: 'specification', status: 'superseded', supersedesIds: [] },
    ],
  })
  const graph = buildTenderKnowledgeGraph(cwd, 'p1', loadWorkspace(cwd, 'p1'))
  assert.ok(graph.edges.some((edge) => edge.from === 'addendum-2' && edge.to === 'spec-rev-a' && edge.relation === 'supersedes'))
  assert.deepEqual(traceKnowledgeGraph(graph, 'addendum-2').paths[0], ['addendum-2', 'spec-rev-a'])
  assert.equal(graph.nodes.filter((node) => node.kind === 'capability').length > 0, true)
})
