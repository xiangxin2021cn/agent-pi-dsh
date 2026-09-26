import { AsyncLocalStorage } from 'node:async_hooks'
import type { WorkflowDefinition } from './workflow.ts'

export interface WorkbenchContribution {
  workflow: WorkflowDefinition
  icon?: string
  owner: string
}

/** One instance per DSH context. Contributions disappear with their owning plugin. */
export class WorkbenchRegistry {
  readonly apiVersion = 1
  private modules = new Map<string, WorkbenchContribution>()
  readonly knowledgeEnabled: () => boolean
  constructor(knowledgeEnabled: () => boolean = () => true) { this.knowledgeEnabled = knowledgeEnabled }

  registerModule(contribution: WorkbenchContribution): () => void {
    const { workflow, owner } = contribution
    if (!owner || !/^[a-z][a-z0-9-]{1,31}$/.test(workflow.module)) throw new Error('Invalid workbench contribution')
    if (!workflow.id || !workflow.label?.trim() || !workflow.labelZh?.trim()) throw new Error('A workflow requires an id and display names')
    if (!workflow.stages?.length) throw new Error('A workflow requires stages')
    const stages = new Set<string>()
    for (const stage of workflow.stages) {
      if (!/^[a-z][a-z0-9-]{1,63}$/.test(stage.id) || stages.has(stage.id)) throw new Error('Invalid or duplicate stage id')
      if (!stage.prompt?.trim() || !stage.labelZh?.trim() || !Array.isArray(stage.skillSlugs)) throw new Error('A stage requires a name, instructions and skill list')
      for (const dependency of stage.consumes || []) {
        if (dependency.kind === 'handoff' && !stages.has(dependency.stageId)) throw new Error('Stage dependencies must precede their consumer')
      }
      stages.add(stage.id)
    }
    if (workflow.setupStageId && !stages.has(workflow.setupStageId)) throw new Error('Unknown setup stage')
    if (this.modules.has(workflow.module)) throw new Error(`Workbench module already registered: ${workflow.module}`)
    const stored = structuredClone(contribution)
    this.modules.set(workflow.module, stored)
    return () => { if (this.modules.get(workflow.module) === stored) this.modules.delete(workflow.module) }
  }

  list(): WorkbenchContribution[] { return structuredClone([...this.modules.values()]) }
  run<T>(action: () => T): T { return scope.run(this, action) }
}

// Legacy domain helpers are pure functions without a Cordis ctx parameter. Only
// scoped plugin entry points bind them; async requests never share a global registry.
const scope = new AsyncLocalStorage<WorkbenchRegistry>()
export function currentWorkbench(): WorkbenchRegistry | undefined { return scope.getStore() }
