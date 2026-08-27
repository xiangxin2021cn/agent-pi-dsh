import { basename, join, resolve } from 'node:path'
import { existsSync, readdirSync, statSync } from 'node:fs'
import {
  createBusinessProject,
  listBusinessProjects,
  SAFE_PROJECT_ID,
  type BusinessProjectRecord,
} from '../../../packages/business-projects/index.ts'
import type { BusinessModuleId } from '../../../packages/business-projects/types.ts'
import { UPLOADS_DIR } from './files.ts'
import { listOfficialOutputs } from './outputs.ts'
import { prepareStage, projectSnapshot } from './orchestration.ts'
import { workflowFor } from './modules.ts'
import { registerProjectSources } from './workspace.ts'

const SUGGEST_CAP = 80

export interface AdoptPreview {
  cwd: string
  name: string
  projectId: string
  officialCount: number
  suggestedInputs: string[]
  existing: BusinessProjectRecord[]
  existingForModule?: BusinessProjectRecord
}

export interface AdoptWorkspaceInput {
  module: BusinessModuleId
  name?: string
  projectId?: string
  inputPaths?: string[]
}

/**
 * @param folder Workspace folder name used as the default project id.
 * @returns A registry-safe id; keeps `260813-grand-coyote` style names intact.
 */
export function suggestAdoptProjectId(folder: string): string {
  const trimmed = String(folder || '').trim()
  if (SAFE_PROJECT_ID.test(trimmed)) return trimmed
  const slug = trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128)
  return slug || `w${Date.now()}`
}

function walkFiles(dirPath: string, out: string[]): void {
  if (out.length >= SUGGEST_CAP || !existsSync(dirPath)) return
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= SUGGEST_CAP) return
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
}

function suggestInputPaths(cwd: string): string[] {
  const found: string[] = []
  walkFiles(join(resolve(cwd), UPLOADS_DIR), found)
  return found
}

function samePath(left: string, right: string): boolean {
  return resolve(left).replace(/\\/g, '/').toLowerCase() === resolve(right).replace(/\\/g, '/').toLowerCase()
}

/**
 * @param cwd Absolute conversation workspace.
 * @param module Optional module used to flag an already-upgraded project.
 * @returns Suggested id, existing official files, and upload paths to register.
 */
export function adoptPreview(cwd: string, module?: BusinessModuleId): AdoptPreview {
  const resolved = resolve(cwd)
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error('当前工作区不存在，无法升级')
  }
  const name = basename(resolved) || 'workspace'
  const projectId = suggestAdoptProjectId(name)
  const existing = listBusinessProjects(resolved).filter((project) => (
    project.projectId === projectId
    || project.projectId === name
    || samePath(project.rootPath, resolved)
  ))
  const officialCount = listOfficialOutputs(resolved, projectId).items.length
  return {
    cwd: resolved,
    name,
    projectId,
    officialCount,
    suggestedInputs: suggestInputPaths(resolved),
    existing,
    existingForModule: module
      ? existing.find((project) => project.module === module)
      : undefined,
  }
}

/**
 * Registers the current conversation folder as a workbench project under the
 * chosen module. Does not create a new directory or move Official Outputs.
 * Setup is prepared only; later stages stay idle so existing files are not rewritten.
 *
 * @param cwd Absolute conversation workspace (also the project root).
 * @param input Target module plus optional name, id, and source paths.
 * @returns The same snapshot the create-project HTTP route returns.
 */
export function adoptWorkspace(cwd: string, input: AdoptWorkspaceInput) {
  const module = input.module
  if (!module) throw new Error('升级必须指定专业模块')
  const preview = adoptPreview(cwd, module)
  if (preview.existingForModule) {
    throw new Error(`当前工作区已是「${module}」项目 ${preview.existingForModule.projectId}`)
  }
  const projectId = input.projectId?.trim() || preview.projectId
  if (listBusinessProjects(preview.cwd).some((project) => project.module === module && project.projectId === projectId)) {
    throw new Error(`Business project ${module}/${projectId} already exists`)
  }
  const project = createBusinessProject({
    workspaceRootPath: preview.cwd,
    projectId,
    module,
    name: input.name?.trim() || preview.name,
    rootPath: preview.cwd,
    workflowId: workflowFor(module).id,
    createDirectory: false,
    inputPaths: input.inputPaths ?? preview.suggestedInputs,
  })
  if (module === 'tender') {
    registerProjectSources(preview.cwd, project.projectId, {
      title: project.name,
      inputPaths: project.inputPaths,
    })
  }
  const workflow = workflowFor(module)
  const firstStage = workflow.setupStageId || workflow.stages[0]?.id
  if (firstStage) prepareStage(preview.cwd, project, firstStage)
  return projectSnapshot(preview.cwd, project)
}
