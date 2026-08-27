import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { BusinessModuleId, BusinessProjectRecord, CreateBusinessProjectInput } from './types.ts'

const REGISTRY_FILE = 'business-projects.json'
const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

interface BusinessProjectRegistry {
  schemaVersion: 1
  projects: BusinessProjectRecord[]
}

function registryPath(workspaceRootPath: string): string {
  if (!isAbsolute(workspaceRootPath)) throw new Error('workspaceRootPath must be absolute')
  return join(resolve(workspaceRootPath), REGISTRY_FILE)
}

function loadRegistry(workspaceRootPath: string): BusinessProjectRegistry {
  const filePath = registryPath(workspaceRootPath)
  if (!existsSync(filePath)) return { schemaVersion: 1, projects: [] }
  const value = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<BusinessProjectRegistry>
  return {
    schemaVersion: 1,
    projects: Array.isArray(value.projects) ? value.projects : [],
  }
}

function saveRegistry(workspaceRootPath: string, registry: BusinessProjectRegistry): void {
  mkdirSync(resolve(workspaceRootPath), { recursive: true })
  const filePath = registryPath(workspaceRootPath)
  writeFileSync(filePath, `${JSON.stringify(registry, null, 2)}\n`)
}

function assertProjectId(projectId: string): void {
  if (!SAFE_PROJECT_ID.test(projectId)) throw new Error('Invalid business project ID')
}

function normalizeRootPath(rootPath: string, createDirectory: boolean): string {
  if (!isAbsolute(rootPath)) throw new Error('rootPath must be absolute')
  const normalized = resolve(rootPath)
  if (createDirectory) mkdirSync(normalized, { recursive: true })
  if (!existsSync(normalized)) throw new Error('Business project root does not exist')
  return normalized
}

function normalizeInputPaths(inputPaths: string[] = []): string[] {
  return [...new Set(inputPaths.map((inputPath) => {
    if (!isAbsolute(inputPath)) throw new Error('Business project input path must be absolute')
    return resolve(inputPath)
  }))]
}

function shellManifestPath(project: Pick<BusinessProjectRecord, 'rootPath' | 'module' | 'projectId'>): string {
  return join(project.rootPath, '.agent-pi', 'business', project.module, project.projectId, 'project-shell.json')
}

function writeShellManifest(project: BusinessProjectRecord): void {
  const filePath = shellManifestPath(project)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(project, null, 2)}\n`)
}

export function listBusinessProjects(workspaceRootPath: string, module?: BusinessModuleId): BusinessProjectRecord[] {
  return loadRegistry(workspaceRootPath).projects
    .filter((project) => !module || project.module === module)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name))
}

export function createBusinessProject(input: CreateBusinessProjectInput): BusinessProjectRecord {
  assertProjectId(input.projectId)
  const rootPath = normalizeRootPath(input.rootPath, input.createDirectory)
  const registry = loadRegistry(input.workspaceRootPath)
  if (registry.projects.some((project) => project.module === input.module && project.projectId === input.projectId)) {
    throw new Error(`Business project ${input.module}/${input.projectId} already exists`)
  }

  const now = new Date().toISOString()
  const project: BusinessProjectRecord = {
    schemaVersion: 1,
    projectId: input.projectId,
    module: input.module,
    name: input.name,
    rootPath,
    workflowId: input.workflowId,
    inputPaths: normalizeInputPaths(input.inputPaths),
    createdAt: now,
    updatedAt: now,
  }
  registry.projects.push(project)
  saveRegistry(input.workspaceRootPath, registry)
  writeShellManifest(project)
  return project
}

export function getBusinessProject(
  workspaceRootPath: string,
  module: BusinessModuleId,
  projectId: string,
): BusinessProjectRecord | undefined {
  return loadRegistry(workspaceRootPath).projects.find(
    (project) => project.module === module && project.projectId === projectId,
  )
}

export function updateBusinessProjectInputs(
  workspaceRootPath: string,
  module: BusinessModuleId,
  projectId: string,
  inputPaths: string[],
): BusinessProjectRecord {
  assertProjectId(projectId)
  const registry = loadRegistry(workspaceRootPath)
  const index = registry.projects.findIndex((project) => project.module === module && project.projectId === projectId)
  if (index < 0) throw new Error(`Business project ${module}/${projectId} does not exist`)
  const current = registry.projects[index]!
  const updated: BusinessProjectRecord = {
    ...current,
    inputPaths: normalizeInputPaths(inputPaths),
    updatedAt: new Date().toISOString(),
  }
  registry.projects[index] = updated
  saveRegistry(workspaceRootPath, registry)
  writeShellManifest(updated)
  return updated
}

export function unregisterBusinessProject(
  workspaceRootPath: string,
  module: BusinessModuleId,
  projectId: string,
): void {
  assertProjectId(projectId)
  const registry = loadRegistry(workspaceRootPath)
  registry.projects = registry.projects.filter((project) => !(project.module === module && project.projectId === projectId))
  saveRegistry(workspaceRootPath, registry)
}

export { SAFE_PROJECT_ID }
