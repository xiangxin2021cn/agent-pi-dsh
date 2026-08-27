import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { listBusinessProjects } from '../../../packages/business-projects/index.ts'
import { projectDir, ensureDir, writeJson, readJson } from './fsutil.ts'

export const OFFICIAL_OUTPUTS_DIR = 'Agent Pi Outputs'

const CUSTOMER_EXT = new Set([
  '.md', '.markdown', '.html', '.htm', '.pdf', '.docx', '.xlsx', '.csv',
  '.png', '.jpg', '.jpeg', '.svg', '.txt', '.xml', '.pptx',
])

export function officialProjectDir(cwd: string, projectId: string): string {
  return join(cwd, OFFICIAL_OUTPUTS_DIR, projectId)
}

/**
 * Directories that may already hold customer-facing files for this project.
 * Canonical layout is `<cwd>/Agent Pi Outputs/<projectId>/`. A regular
 * conversation sometimes uses the official folder itself as cwd (so files sit
 * in `cwd/published`), or names the folder differently from `projectId`.
 */
export function officialScanRoots(cwd: string, projectId: string): string[] {
  const roots = new Set<string>()
  roots.add(resolve(officialProjectDir(cwd, projectId)))
  const folder = basename(resolve(cwd))
  if (folder && folder !== projectId) roots.add(resolve(officialProjectDir(cwd, folder)))
  if (existsSync(join(cwd, 'published'))) roots.add(resolve(cwd))
  return [...roots]
}

export function officialStageFolder(stageId?: string): string {
  switch (stageId) {
    case 'tender-document-analysis':
      return 'document-analysis'
    case 'boq-five-step-pricing':
      return 'boq-pricing'
    case 'planning-and-submission':
      return 'planning'
    case 'project-setup':
      return 'setup'
    case 'delivery-setup':
    case 'delivery-controls':
      return 'delivery'
    case 'investment-setup':
    case 'investment-diligence':
      return 'investment'
    default:
      // User-built domain modules: each stage keeps its own folder named by the
      // stage id (already slug-validated), so outputs stay separated per stage.
      return stageId && /^[a-z0-9][a-z0-9-]*$/.test(stageId) ? stageId : 'published'
  }
}

export function officialStageDir(cwd: string, projectId: string, stageId?: string): string {
  return join(officialProjectDir(cwd, projectId), officialStageFolder(stageId))
}

/** @deprecated use officialStageDir; kept for callers that passed a session segment */
export function officialOutputsDir(cwd: string, projectId: string, folder = 'published'): string {
  return join(officialProjectDir(cwd, projectId), folder)
}

function isSamePath(left: string, right: string): boolean {
  return resolve(left).replace(/\\/g, '/').toLowerCase() === resolve(right).replace(/\\/g, '/').toLowerCase()
}

export function copyFileIfNewer(sourcePath: string, destinationPath: string): boolean {
  if (!existsSync(sourcePath) || isSamePath(sourcePath, destinationPath)) return false
  mkdirSync(dirname(destinationPath), { recursive: true })
  if (existsSync(destinationPath)) {
    try {
      const sourceStat = statSync(sourcePath)
      const destStat = statSync(destinationPath)
      if (destStat.mtimeMs >= sourceStat.mtimeMs && destStat.size === sourceStat.size) return false
    } catch {
      // copy
    }
  }
  copyFileSync(sourcePath, destinationPath)
  return true
}

function isCustomerFile(name: string): boolean {
  // Underscore/dot/tilde-prefixed files are scratch artifacts subagents leave
  // behind (size probes, temp dumps); they must never surface as official outputs.
  if (name.startsWith('_') || name.startsWith('.') || name.startsWith('~')) return false
  return CUSTOMER_EXT.has(extname(name).toLowerCase())
}

function catalogPath(cwd: string, projectId: string, module = 'tender') {
  return join(projectDir(cwd, module, projectId), 'orchestration', 'official-outputs.json')
}

function appendCatalog(cwd: string, projectId: string, dest: string, kind: string, module = 'tender'): void {
  const path = catalogPath(cwd, projectId, module)
  const catalog = readJson<{ items: Array<{ dest: string; kind: string; at: string }> }>(path, { items: [] })
  if (!catalog.items.some((item) => isSamePath(item.dest, dest))) {
    catalog.items.push({ dest, kind, at: new Date().toISOString() })
    writeJson(path, catalog)
  }
}

export function publishOfficialOutput(
  cwd: string,
  projectId: string,
  sourcePath: string,
  kind: 'json' | 'markdown' | 'other' = 'other',
  folder?: string,
  module = 'tender',
): { dest: string } {
  if (!existsSync(sourcePath)) throw new Error(`Source file does not exist: ${sourcePath}`)
  if (extname(sourcePath).toLowerCase() === '.json') {
    throw new Error('JSON ledgers stay in orchestration/reports. Write customer Markdown to Official Outputs.')
  }
  const destDir = folder
    ? officialOutputsDir(cwd, projectId, folder)
    : dirname(officialDestForHarvest(cwd, projectId, basename(sourcePath)))
  ensureDir(destDir)
  const dest = join(destDir, basename(sourcePath))
  copyFileIfNewer(sourcePath, dest)
  appendCatalog(cwd, projectId, dest, kind === 'json' ? 'other' : kind, module)
  return { dest }
}

function scanCustomerFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return []
  const found: string[] = []
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) found.push(...scanCustomerFiles(full))
    else if (isCustomerFile(entry.name)) found.push(full)
  }
  return found
}

function inferStageFromFilename(name: string, fallbackStage?: string): string | undefined {
  const lower = name.toLowerCase()
  if (
    lower.includes('boq') || lower.includes('pricing') || lower.includes('组价')
    || lower.includes('资源消耗') || lower.includes('供应商') || lower.includes('询价') || lower.includes('尽调')
    || lower.includes('工效') || lower.includes('组价依据')
  ) {
    return 'boq-five-step-pricing'
  }
  if (
    lower.includes('plan') || lower.includes('schedule') || lower.includes('cash')
    || lower.includes('programme') || lower.includes('策划') || lower.includes('进度')
    || lower.includes('work_plan') || lower.endsWith('.xml')
  ) {
    return 'planning-and-submission'
  }
  if (lower.includes('analysis') || lower.includes('解析') || lower.includes('document')) {
    return 'tender-document-analysis'
  }
  return fallbackStage
}

/**
 * Destination for one customer file inside the unified official tree: stage
 * folder inferred from the file name, falling back to the given stage.
 * The 项目特征 chapter is a document-analysis deliverable; every customer file
 * lives under a stage folder so downstream stages read from one predictable tree.
 * @param name File base name used for stage inference.
 * @param fallbackStage Stage id used when the name matches no stage pattern.
 * @returns Absolute destination path under the project's official outputs.
 */
export function officialDestForHarvest(cwd: string, projectId: string, name: string, fallbackStage?: string): string {
  if (name.includes('项目特征')) {
    return join(officialStageDir(cwd, projectId, 'tender-document-analysis'), name)
  }
  return join(officialStageDir(cwd, projectId, inferStageFromFilename(name, fallbackStage)), name)
}

export function syncProjectOutputs(cwd: string, projectId: string, module = 'tender', stageId?: string): { published: number } {
  const reportsDir = join(projectDir(cwd, module, projectId), 'orchestration', 'reports')
  const fallback = stageId ?? (module === 'delivery' ? 'delivery-controls' : module === 'investment' ? 'investment-diligence' : undefined)
  let published = 0
  for (const source of scanCustomerFiles(reportsDir)) {
    const dest = officialDestForHarvest(cwd, projectId, basename(source), fallback)
    if (copyFileIfNewer(source, dest)) {
      appendCatalog(cwd, projectId, dest, extname(source).toLowerCase() === '.md' ? 'markdown' : 'other', module)
      published += 1
    }
  }
  return { published }
}

export function syncWorkbenchOutputs(cwd: string): { published: number } {
  let published = 0
  for (const project of listBusinessProjects(cwd)) {
    published += syncProjectOutputs(cwd, project.projectId, project.module).published
  }
  return { published }
}

export function listOfficialOutputs(cwd: string, projectId: string, module = 'tender') {
  const path = catalogPath(cwd, projectId, module)
  const catalog = readJson<{ items: Array<{ dest: string; kind: string; at: string }> }>(path, { items: [] })
  const scanned = officialScanRoots(cwd, projectId).flatMap((root) => scanCustomerFiles(root))
  const byDest = new Map(catalog.items.map((item) => [resolve(item.dest), item]))
  for (const dest of scanned) {
    const key = resolve(dest)
    if (!byDest.has(key)) {
      byDest.set(key, {
        dest,
        kind: extname(dest).toLowerCase() === '.md' ? 'markdown' : 'other',
        at: new Date().toISOString(),
      })
    }
  }
  return {
    items: [...byDest.values()]
      // Catalog rows for renamed/deleted or scratch files must not linger in the UI.
      .filter((item) => existsSync(item.dest) && isCustomerFile(basename(item.dest)))
      .map((item) => ({
        ...item,
        relativePath: relative(resolve(cwd), item.dest).replace(/\\/g, '/'),
      })),
  }
}

const UPLOADS_DIR_NAME = 'Agent Pi Uploads'
const DELIVERABLE_HINT = /报告|调研|策划|分析|成果|产出|组价|进度|地图|map|report|plan|survey|analysis|brief|memo|deliverable/i

function assertInsideCwd(cwd: string, target: string): string {
  const root = resolve(cwd)
  const resolved = resolve(target)
  const prefix = root.endsWith(sep) ? root : root + sep
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new Error('path is outside the workspace')
  }
  return resolved
}

function harvestProjectId(cwd: string): string {
  const projects = listBusinessProjects(cwd)
  const tender = projects.find((project) => project.module === 'tender')
  if (tender) return tender.projectId
  const named = projects.find((project) => project.projectId === basename(resolve(cwd)))
  if (named) return named.projectId
  return projects[0]?.projectId || basename(resolve(cwd)) || 'workspace'
}

function relativePosix(cwd: string, fullPath: string): string {
  return relative(resolve(cwd), resolve(fullPath)).replaceAll('\\', '/')
}

function skipHarvestSource(cwd: string, fullPath: string): boolean {
  const rel = relativePosix(cwd, fullPath)
  if (!rel || rel === '.' || rel.startsWith('..')) return true
  if (rel === OFFICIAL_OUTPUTS_DIR || rel.startsWith(`${OFFICIAL_OUTPUTS_DIR}/`)) return true
  if (rel === UPLOADS_DIR_NAME || rel.startsWith(`${UPLOADS_DIR_NAME}/`)) return true
  if (rel.startsWith('.agent-pi/') && !rel.includes('/orchestration/reports/')) return true
  if (rel.split('/').some((part) => part === 'node_modules' || part === '.git')) return true
  return false
}

function publishHarvested(cwd: string, sourcePath: string): string | null {
  if (!existsSync(sourcePath) || statSync(sourcePath).isDirectory()) return null
  if (skipHarvestSource(cwd, sourcePath)) return null
  if (!isCustomerFile(basename(sourcePath))) return null
  if (extname(sourcePath).toLowerCase() === '.json') return null
  const projectId = harvestProjectId(cwd)
  const destDir = officialProjectDir(cwd, projectId)
  ensureDir(destDir)
  const dest = join(destDir, basename(sourcePath))
  const copied = copyFileIfNewer(sourcePath, dest)
  if (copied) appendCatalog(cwd, projectId, dest, extname(sourcePath).toLowerCase() === '.md' ? 'markdown' : 'other')
  return existsSync(dest) ? dest : null
}

function scanHarvestSources(dirPath: string, cwd: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth || !existsSync(dirPath)) return []
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue
    if (entry.name === 'node_modules' || entry.name === OFFICIAL_OUTPUTS_DIR || entry.name === UPLOADS_DIR_NAME) continue
    const full = join(dirPath, entry.name)
    if (skipHarvestSource(cwd, full) && entry.isDirectory()) continue
    if (entry.isDirectory()) found.push(...scanHarvestSources(full, cwd, maxDepth, depth + 1))
    else if (isCustomerFile(entry.name) && DELIVERABLE_HINT.test(entry.name)) found.push(full)
  }
  return found
}

export function harvestWorkspaceOutputs(cwd: string, paths: string[] = []): { published: number; dests: string[] } {
  const reports = syncWorkbenchOutputs(cwd)
  const dests: string[] = []
  const seen = new Set<string>()
  const take = (source: string, force: boolean) => {
    try {
      const full = assertInsideCwd(cwd, source)
      if (!force && !DELIVERABLE_HINT.test(basename(full))) return
      const dest = publishHarvested(cwd, full)
      if (dest && !seen.has(dest)) {
        seen.add(dest)
        dests.push(dest)
      }
    } catch {
      // skip paths outside the workspace or missing files
    }
  }
  for (const source of paths) take(source, true)
  if (paths.length === 0) {
    for (const source of scanHarvestSources(resolve(cwd), cwd, 2)) take(source, false)
  }
  return { published: dests.length + reports.published, dests }
}
