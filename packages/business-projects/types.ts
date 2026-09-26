import type { WorkflowDefinition } from './workflow.ts'

/**
 * Business module id. Built-ins are 'tender' | 'delivery' | 'investment'; user-created
 * workbench modules add ids matching /^[a-z][a-z0-9-]{1,31}$/ (validated where modules
 * are defined). Callers must resolve ids through the module registry, never assume the
 * built-in set.
 */
export type BusinessModuleId = string

export interface BusinessProjectRecord {
  schemaVersion: 1
  projectId: string
  module: BusinessModuleId
  name: string
  rootPath: string
  workflowId: string
  /** Workflow captured when this project was created; later module edits do not change it. */
  workflowSnapshot?: WorkflowDefinition
  inputPaths: string[]
  /** Stable end-to-end objective injected into every bound DSH turn. */
  projectGoal?: string
  /** Concrete final artifacts/outcomes proving the project is finished. */
  terminalDeliverables?: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateBusinessProjectInput {
  workspaceRootPath: string
  projectId: string
  module: BusinessModuleId
  name: string
  rootPath: string
  workflowId: string
  /** Workflow captured when this project was created; later module edits do not change it. */
  workflowSnapshot?: WorkflowDefinition
  createDirectory: boolean
  inputPaths?: string[]
  projectGoal?: string
  terminalDeliverables?: string[]
}

export interface UpdateBusinessProjectContractInput {
  projectGoal?: string
  terminalDeliverables?: string[]
}
