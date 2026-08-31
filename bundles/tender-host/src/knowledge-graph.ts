import { existsSync, readFileSync } from 'node:fs'
import type { TenderWorkspace } from '../../../packages/business-core/src/tender/index.ts'
import { workspacePaths } from './workspace.ts'

export interface KnowledgeGraphNode {
  id: string
  kind: 'document' | 'capability' | 'core'
  label: string
  status?: string
  revision?: number
  stale?: boolean
}

export interface KnowledgeGraphEdge {
  from: string
  to: string
  relation: 'supersedes' | 'depends-on'
}

export interface TenderKnowledgeGraph {
  schemaVersion: 1
  projectId: string
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
}

/** Derive, do not duplicate, the authoritative workspace/capability dependency state. */
export function buildTenderKnowledgeGraph(cwd: string, projectId: string, workspace: TenderWorkspace): TenderKnowledgeGraph {
  const nodes: KnowledgeGraphNode[] = workspace.documents.map((document) => ({
    id: document.id,
    kind: 'document',
    label: document.name,
    status: document.status,
  }))
  const edges: KnowledgeGraphEdge[] = []
  for (const document of workspace.documents) {
    for (const target of document.supersedesIds ?? []) {
      edges.push({ from: document.id, to: target, relation: 'supersedes' })
    }
  }
  const paths = workspacePaths(cwd, projectId)
  if (existsSync(paths.index)) {
    const index = JSON.parse(readFileSync(paths.index, 'utf8')) as {
      coreRevision?: number
      capabilities?: Array<{ capability: string; revision: number; readiness: string; stale: boolean }>
    }
    nodes.push({ id: 'core', kind: 'core', label: 'Tender workspace core', revision: index.coreRevision })
    for (const capability of index.capabilities ?? []) {
      const id = `capability:${capability.capability}`
      nodes.push({ id, kind: 'capability', label: capability.capability, revision: capability.revision, status: capability.readiness, stale: capability.stale })
      const packPath = `${paths.packs}/${capability.capability.replace(/_/g, '-')}.json`
      if (!existsSync(packPath)) continue
      try {
        const envelope = JSON.parse(readFileSync(packPath, 'utf8')) as { upstream?: Array<{ capability: string }> }
        for (const upstream of envelope.upstream ?? []) {
          edges.push({ from: id, to: upstream.capability === 'core' ? 'core' : `capability:${upstream.capability}`, relation: 'depends-on' })
        }
      } catch { /* broken packs are already marked stale by workspace.ts */ }
    }
  }
  return { schemaVersion: 1, projectId, nodes, edges }
}

export function traceKnowledgeGraph(graph: TenderKnowledgeGraph, from: string, maxHops = 4): { nodes: KnowledgeGraphNode[]; paths: string[][] } {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const paths: string[][] = []
  const visited = new Set<string>([from])
  let frontier: string[][] = [[from]]
  for (let hop = 0; hop < Math.max(1, Math.min(12, maxHops)); hop++) {
    const next: string[][] = []
    for (const path of frontier) {
      const tail = path.at(-1) as string
      for (const edge of graph.edges.filter((candidate) => candidate.from === tail)) {
        const extended = [...path, edge.to]
        paths.push(extended)
        if (!visited.has(edge.to)) {
          visited.add(edge.to)
          next.push(extended)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return { nodes: [...visited].map((id) => byId.get(id)).filter((node): node is KnowledgeGraphNode => Boolean(node)), paths }
}
