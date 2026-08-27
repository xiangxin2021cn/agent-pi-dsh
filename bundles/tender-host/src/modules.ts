/**
 * Workbench module registry: built-in modules (tender/delivery/investment, defined in
 * workflows.ts) plus user-created domain modules stored as one JSON file per module.
 *
 * User module root resolution: AGENT_PI_MODULES_ROOT (tests/overrides) →
 * $DSH_HOME/workbench/modules (packaged desktop: userData, survives upgrades) →
 * ~/.agent-pi/workbench/modules.
 *
 * A user module file is `<id>.json` following ModuleFile below. Invalid files never
 * brick the workbench: they are skipped and surfaced as errors in list results and the
 * workbench API. Disabling (built-in or user) only hides a module from listing and
 * project creation — existing projects keep resolving their workflow.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readJson, writeJson } from './fsutil.ts'
import { WORKFLOWS, type WorkflowDefinition, type WorkflowStage } from './workflows.ts'

/** One JSON file under the user modules root. */
export interface ModuleFile {
  schemaVersion: 1
  id: string
  label?: string
  labelZh: string
  /** Icon name from the workbench icon set; unknown names fall back in the client. */
  icon?: string
  setupStageId?: string
  bindingAreaByStage?: Record<string, 'analysis' | 'pricing' | 'planning'>
  kbPack?: {
    analysis?: string[]
    pricing?: string[]
    planning?: string[]
  }
  stages: Array<{
    id: string
    label?: string
    labelZh: string
    hintZh?: string
    prompt: string
    skillSlugs?: string[]
    reviewSkillSlugs?: string[]
    listsSources?: boolean
    summaryDeliverable?: { fileName: string; outlineZh: string[] }
  }>
}

export interface WorkbenchModuleInfo {
  id: string
  label: string
  labelZh: string
  icon: string
  builtin: boolean
  disabled: boolean
  stageCount: number
  /** User module JSON file; absent for built-ins. */
  sourcePath?: string
  workflow: WorkflowDefinition
}

export interface ModuleLoadError {
  file: string
  error: string
}

const BUILTIN_ICONS: Record<string, string> = {
  tender: 'clipboardCheck',
  delivery: 'clipboardList',
  investment: 'landmark',
}

const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/
const STAGE_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/
const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

export function modulesRoot(): string {
  const explicit = process.env.AGENT_PI_MODULES_ROOT
  if (explicit) return resolve(explicit)
  const dshHome = process.env.DSH_HOME
  if (dshHome) return resolve(dshHome, 'workbench', 'modules')
  return resolve(homedir(), '.agent-pi', 'workbench', 'modules')
}

function configPath(): string {
  return join(modulesRoot(), '..', 'modules-config.json')
}

interface ModulesConfig {
  schemaVersion: 1
  disabled: string[]
}

function loadConfig(): ModulesConfig {
  const raw = readJson<Partial<ModulesConfig>>(configPath(), { schemaVersion: 1, disabled: [] })
  return { schemaVersion: 1, disabled: Array.isArray(raw.disabled) ? raw.disabled.map(String) : [] }
}

function fail(message: string): never {
  throw new Error(message)
}

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(`${field} 必须是字符串数组`)
  return value.map((item, index) => {
    if (typeof item !== 'string' || !SLUG_PATTERN.test(item)) {
      fail(`${field}[${index}] 不是合法 skill slug（小写字母数字与 . _ -）：${String(item)}`)
    }
    return item
  })
}

/**
 * Validate an untrusted module definition (tool JSON / user file / HTTP body).
 * @param value - parsed JSON of a candidate module file.
 * @returns the normalized ModuleFile.
 * @throws Error with a field-precise Chinese message on the first violation.
 */
export function validateModuleFile(value: unknown): ModuleFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('模块定义必须是 JSON 对象')
  const raw = value as Record<string, unknown>
  if (raw.schemaVersion !== 1) fail('schemaVersion 必须是 1')
  const id = String(raw.id ?? '')
  if (!MODULE_ID_PATTERN.test(id)) fail(`模块 id "${id}" 不合法：小写字母开头，2-32 位小写字母/数字/连字符`)
  if (WORKFLOWS[id]) fail(`模块 id "${id}" 是内置模块，不可覆盖；请换一个 id`)
  const labelZh = String(raw.labelZh ?? '').trim()
  if (!labelZh) fail('labelZh（模块中文名）不能为空')
  const label = raw.label === undefined ? undefined : String(raw.label).trim() || undefined
  const icon = raw.icon === undefined ? undefined : String(raw.icon).trim() || undefined
  if (!Array.isArray(raw.stages) || raw.stages.length === 0) fail('stages 至少需要一个阶段')
  if (raw.stages.length > 12) fail('stages 最多 12 个阶段')
  const seen = new Set<string>()
  const stages: ModuleFile['stages'] = raw.stages.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`stages[${index}] 必须是对象`)
    const stage = entry as Record<string, unknown>
    const stageId = String(stage.id ?? '')
    if (!STAGE_ID_PATTERN.test(stageId)) fail(`stages[${index}].id "${stageId}" 不合法（小写字母开头，小写字母/数字/连字符）`)
    if (seen.has(stageId)) fail(`阶段 id 重复：${stageId}`)
    seen.add(stageId)
    const stageLabelZh = String(stage.labelZh ?? '').trim()
    if (!stageLabelZh) fail(`stages[${index}].labelZh 不能为空`)
    const prompt = String(stage.prompt ?? '').trim()
    if (!prompt) fail(`stages[${index}].prompt（阶段要求）不能为空`)
    let summaryDeliverable: ModuleFile['stages'][number]['summaryDeliverable']
    if (stage.summaryDeliverable !== undefined) {
      if (!stage.summaryDeliverable || typeof stage.summaryDeliverable !== 'object' || Array.isArray(stage.summaryDeliverable)) {
        fail(`stages[${index}].summaryDeliverable 必须是对象`)
      }
      const summary = stage.summaryDeliverable as Record<string, unknown>
      const fileName = String(summary.fileName ?? '').trim()
      if (!fileName) fail(`stages[${index}].summaryDeliverable.fileName 不能为空`)
      if (!Array.isArray(summary.outlineZh) || summary.outlineZh.length === 0) {
        fail(`stages[${index}].summaryDeliverable.outlineZh 至少需要一条`)
      }
      summaryDeliverable = {
        fileName,
        outlineZh: summary.outlineZh.map((line, lineIndex) => {
          const text = String(line ?? '').trim()
          if (!text) fail(`stages[${index}].summaryDeliverable.outlineZh[${lineIndex}] 不能为空`)
          return text
        }),
      }
    }
    return {
      id: stageId,
      label: stage.label === undefined ? undefined : String(stage.label).trim() || undefined,
      labelZh: stageLabelZh,
      hintZh: stage.hintZh === undefined ? undefined : String(stage.hintZh).trim() || undefined,
      prompt,
      skillSlugs: asStringArray(stage.skillSlugs, `stages[${index}].skillSlugs`),
      reviewSkillSlugs: asStringArray(stage.reviewSkillSlugs, `stages[${index}].reviewSkillSlugs`),
      listsSources: stage.listsSources === undefined ? undefined : Boolean(stage.listsSources),
      summaryDeliverable,
    }
  })
  let setupStageId: string | undefined
  if (raw.setupStageId !== undefined) {
    setupStageId = String(raw.setupStageId)
    if (!seen.has(setupStageId)) fail(`setupStageId "${setupStageId}" 不在 stages 里`)
  }
  let bindingAreaByStage: ModuleFile['bindingAreaByStage']
  if (raw.bindingAreaByStage !== undefined) {
    if (!raw.bindingAreaByStage || typeof raw.bindingAreaByStage !== 'object' || Array.isArray(raw.bindingAreaByStage)) {
      fail('bindingAreaByStage 必须是 {阶段id: analysis|pricing|planning} 对象')
    }
    bindingAreaByStage = {}
    for (const [stageId, area] of Object.entries(raw.bindingAreaByStage as Record<string, unknown>)) {
      if (!seen.has(stageId)) fail(`bindingAreaByStage 引用了不存在的阶段 ${stageId}`)
      if (area !== 'analysis' && area !== 'pricing' && area !== 'planning') {
        fail(`bindingAreaByStage.${stageId} 必须是 analysis | pricing | planning`)
      }
      bindingAreaByStage[stageId] = area
    }
  }
  let kbPack: ModuleFile['kbPack']
  if (raw.kbPack !== undefined) {
    if (!raw.kbPack || typeof raw.kbPack !== 'object' || Array.isArray(raw.kbPack)) {
      fail('kbPack 必须是 { analysis|pricing|planning: slug[] } 对象')
    }
    kbPack = {}
    for (const area of ['analysis', 'pricing', 'planning'] as const) {
      const value = (raw.kbPack as Record<string, unknown>)[area]
      if (value === undefined) continue
      kbPack[area] = asStringArray(value, `kbPack.${area}`)
    }
  }
  return { schemaVersion: 1, id, label, labelZh, icon, setupStageId, bindingAreaByStage, kbPack, stages }
}

function toWorkflow(file: ModuleFile): WorkflowDefinition {
  const stages: WorkflowStage[] = file.stages.map((stage) => ({
    id: stage.id,
    label: stage.label ?? stage.labelZh,
    labelZh: stage.labelZh,
    hintZh: stage.hintZh ?? stage.prompt.slice(0, 60),
    prompt: stage.prompt,
    skillSlugs: stage.skillSlugs ?? [],
    reviewSkillSlugs: stage.reviewSkillSlugs && stage.reviewSkillSlugs.length > 0 ? stage.reviewSkillSlugs : undefined,
    listsSources: stage.listsSources,
    summaryDeliverable: stage.summaryDeliverable,
  }))
  return {
    id: `${file.id}-main`,
    module: file.id,
    label: file.label ?? file.labelZh,
    labelZh: file.labelZh,
    setupStageId: file.setupStageId,
    bindingAreaByStage: file.bindingAreaByStage,
    kbPack: file.kbPack,
    stages,
  }
}

function userModulePath(id: string): string {
  return join(modulesRoot(), `${id}.json`)
}

function loadUserModules(): { files: Array<{ path: string; file: ModuleFile }>; errors: ModuleLoadError[] } {
  const root = modulesRoot()
  const files: Array<{ path: string; file: ModuleFile }> = []
  const errors: ModuleLoadError[] = []
  if (!existsSync(root)) return { files, errors }
  let names: string[]
  try {
    names = readdirSync(root).filter((name) => name.toLocaleLowerCase().endsWith('.json'))
  } catch {
    return { files, errors }
  }
  for (const name of names.sort()) {
    const path = join(root, name)
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
      const file = validateModuleFile(parsed)
      if (`${file.id}.json` !== name) fail(`文件名 ${name} 与模块 id ${file.id} 不一致（应为 ${file.id}.json）`)
      if (files.some((existing) => existing.file.id === file.id)) fail(`模块 id ${file.id} 重复`)
      files.push({ path, file })
    } catch (error) {
      errors.push({ file: path, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { files, errors }
}

/**
 * List every workbench module (built-in + user) with load errors from broken user files.
 * @param options.includeDisabled - include disabled modules (management UI); default false.
 */
export function listWorkbenchModules(options: { includeDisabled?: boolean } = {}): {
  modules: WorkbenchModuleInfo[]
  errors: ModuleLoadError[]
} {
  const disabled = new Set(loadConfig().disabled)
  const { files, errors } = loadUserModules()
  const modules: WorkbenchModuleInfo[] = []
  for (const [id, workflow] of Object.entries(WORKFLOWS)) {
    modules.push({
      id,
      label: workflow.label,
      labelZh: workflow.labelZh,
      icon: BUILTIN_ICONS[id] ?? 'clipboardCheck',
      builtin: true,
      disabled: disabled.has(id),
      stageCount: workflow.stages.length,
      workflow,
    })
  }
  for (const { path, file } of files) {
    const workflow = toWorkflow(file)
    modules.push({
      id: file.id,
      label: workflow.label,
      labelZh: workflow.labelZh,
      icon: file.icon ?? 'clipboardCheck',
      builtin: false,
      disabled: disabled.has(file.id),
      stageCount: workflow.stages.length,
      sourcePath: path,
      workflow,
    })
  }
  const visible = options.includeDisabled ? modules : modules.filter((module) => !module.disabled)
  return { modules: visible, errors }
}

/**
 * Resolve the workflow for a module id. Built-ins resolve from code; user modules from
 * their JSON file. Disabled modules still resolve so existing projects keep working.
 * @throws Error naming the module when it does not exist (or its file is invalid).
 */
export function workflowFor(module: string): WorkflowDefinition {
  const builtin = WORKFLOWS[module]
  if (builtin) return builtin
  const path = userModulePath(module)
  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return toWorkflow(validateModuleFile(parsed))
  }
  throw new Error(`Unknown module ${module}（既不是内置模块，也没有 ${path}）`)
}

/**
 * Create or replace a user module definition file after validation.
 * @param value - untrusted module JSON (tool args / HTTP body).
 * @returns the stored module info.
 */
export function saveUserModule(value: unknown): WorkbenchModuleInfo {
  const file = validateModuleFile(value)
  const path = userModulePath(file.id)
  writeJson(path, file)
  const workflow = toWorkflow(file)
  return {
    id: file.id,
    label: workflow.label,
    labelZh: workflow.labelZh,
    icon: file.icon ?? 'clipboardCheck',
    builtin: false,
    disabled: loadConfig().disabled.includes(file.id),
    stageCount: workflow.stages.length,
    sourcePath: path,
    workflow,
  }
}

/** Snapshot a live workflow into a user-module JSON document. */
export function workflowToModuleFile(
  workflow: WorkflowDefinition,
  id: string,
  labelZh?: string,
  icon?: string,
): ModuleFile {
  return {
    schemaVersion: 1,
    id,
    label: workflow.label,
    labelZh: (labelZh ?? workflow.labelZh).trim(),
    icon: icon || BUILTIN_ICONS[workflow.module],
    setupStageId: workflow.setupStageId,
    bindingAreaByStage: workflow.bindingAreaByStage,
    kbPack: workflow.kbPack,
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      labelZh: stage.labelZh,
      hintZh: stage.hintZh,
      prompt: stage.prompt,
      skillSlugs: stage.skillSlugs,
      reviewSkillSlugs: stage.reviewSkillSlugs,
      listsSources: stage.listsSources,
      summaryDeliverable: stage.summaryDeliverable,
    })),
  }
}

function takenModuleIds(): Set<string> {
  return new Set([
    ...Object.keys(WORKFLOWS),
    ...loadUserModules().files.map((item) => item.file.id),
  ])
}

/** Next free `<source>-copy` / `<source>-copy-n` that fits the module id rule. */
export function suggestCopyModuleId(sourceId: string): string {
  const taken = takenModuleIds()
  const root = sourceId.slice(0, 24)
  const candidates = [`${root}-copy`, ...Array.from({ length: 30 }, (_, index) => `${root}-copy-${index + 2}`)]
  const found = candidates.find((id) => MODULE_ID_PATTERN.test(id) && !taken.has(id))
  if (!found) fail(`无法为 ${sourceId} 分配副本 id`)
  return found
}

/**
 * Clone a built-in or user module into a new user-module file. Built-ins stay
 * untouched. The copy is live immediately (same as saveUserModule).
 */
export function copyWorkbenchModule(
  sourceId: string,
  dest: { id?: string; labelZh?: string } = {},
): WorkbenchModuleInfo {
  const source = listWorkbenchModules({ includeDisabled: true }).modules.find((item) => item.id === sourceId)
  if (!source) fail(`未知模块 ${sourceId}`)
  const id = String(dest.id ?? '').trim() || suggestCopyModuleId(sourceId)
  if (takenModuleIds().has(id)) fail(`模块 id "${id}" 已存在`)
  const labelZh = String(dest.labelZh ?? '').trim() || `${source.labelZh}（副本）`
  const file = workflowToModuleFile(source.workflow, id, labelZh, source.icon)
  return saveUserModule(file)
}

/**
 * Delete a user module file. Built-ins cannot be removed (disable them instead).
 * Existing projects of the removed module keep their data but lose workflow resolution,
 * so the caller should warn when projects still reference it.
 */
export function removeUserModule(id: string): { removed: boolean; id: string; sourcePath: string } {
  if (WORKFLOWS[id]) fail(`内置模块 ${id} 不可删除；如不需要可禁用。`)
  const path = userModulePath(id)
  if (!existsSync(path)) return { removed: false, id, sourcePath: path }
  rmSync(path)
  return { removed: true, id, sourcePath: path }
}

/**
 * User-level DSH skill root ($DSH_HOME/skills). Skills written here hot-load through
 * skill-filesystem's user-dsh row and survive app upgrades, unlike the bundled skill dir.
 * AGENT_PI_SKILLS_ROOT overrides for tests.
 */
export function userSkillsRoot(): string {
  const explicit = process.env.AGENT_PI_SKILLS_ROOT
  if (explicit) return resolve(explicit)
  const dshHome = process.env.DSH_HOME
  if (dshHome) return resolve(dshHome, 'skills')
  return resolve(homedir(), '.dsh', 'skills')
}

const SKILL_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,63}$/

/**
 * Persist a domain method skill to the user skill root as `<slug>/SKILL.md`.
 * Validates the slug and the YAML frontmatter (name matching the slug + description)
 * so the file is guaranteed to load; DSH picks it up without restart.
 * @param slugRaw - kebab-case skill slug (directory name and frontmatter name).
 * @param markdownRaw - full SKILL.md content including frontmatter.
 * @returns stored path and whether the file was newly created.
 */
export function saveUserSkill(slugRaw: unknown, markdownRaw: unknown): { slug: string; path: string; created: boolean } {
  const slug = String(slugRaw ?? '').trim()
  if (!SKILL_SLUG_PATTERN.test(slug)) fail(`skill slug 非法：${slug || '(空)'}（需小写字母开头的 kebab-case，2-64 字符）`)
  const markdown = String(markdownRaw ?? '').replace(/\r\n/g, '\n')
  const trimmed = markdown.trimStart()
  if (!trimmed.startsWith('---\n')) fail('SKILL.md 必须以 YAML frontmatter 开头（--- name / description ---）')
  const end = trimmed.indexOf('\n---', 4)
  if (end < 0) fail('frontmatter 未闭合：缺少结束的 ---')
  const frontmatter = trimmed.slice(4, end)
  const nameMatch = frontmatter.match(/^name:\s*(\S+)\s*$/m)
  if (!nameMatch) fail('frontmatter 缺少 name 字段')
  if (nameMatch[1] !== slug) fail(`frontmatter name (${nameMatch[1]}) 必须与 slug (${slug}) 一致`)
  if (!/^description:\s*\S/m.test(frontmatter)) fail('frontmatter 缺少 description 字段（一句话说明何时使用）')
  if (!trimmed.slice(end + 4).trim()) fail('SKILL.md 正文为空：frontmatter 之后需要方法内容')
  const dir = join(userSkillsRoot(), slug)
  const path = join(dir, 'SKILL.md')
  const created = !existsSync(path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8')
  return { slug, path, created }
}

export interface UserSkillListItem {
  slug: string
  name: string
  description: string
  path: string
  updatedAt: string
}

function skillFrontmatterField(markdown: string, field: string): string {
  const trimmed = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimStart()
  if (!trimmed.startsWith('---\n')) return ''
  const end = trimmed.indexOf('\n---', 4)
  if (end < 0) return ''
  const block = trimmed.slice(4, end)
  const match = block.match(new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm'))
  return match ? String(match[1] || '').trim() : ''
}

/** User-authored skills under $DSH_HOME/skills. Bundled product skills are not listed. */
export function listUserSkills(): UserSkillListItem[] {
  const root = userSkillsRoot()
  if (!existsSync(root)) return []
  const out: UserSkillListItem[] = []
  for (const slug of readdirSync(root)) {
    if (!SKILL_SLUG_PATTERN.test(slug)) continue
    const path = join(root, slug, 'SKILL.md')
    if (!existsSync(path)) continue
    let markdown = ''
    try {
      markdown = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const name = skillFrontmatterField(markdown, 'name') || slug
    const description = skillFrontmatterField(markdown, 'description')
    let updatedAt = ''
    try {
      updatedAt = statSync(path).mtime.toISOString()
    } catch {
      updatedAt = ''
    }
    out.push({ slug, name, description, path, updatedAt })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function readUserSkill(slugRaw: string): { slug: string; markdown: string } {
  const slug = String(slugRaw || '').trim()
  if (!SKILL_SLUG_PATTERN.test(slug)) throw new Error(`未找到技能 ${slug || '(空)'}`)
  const path = join(userSkillsRoot(), slug, 'SKILL.md')
  if (!existsSync(path)) throw new Error(`未找到技能 ${slug}`)
  return { slug, markdown: readFileSync(path, 'utf8') }
}

/**
 * Hide or unhide a module from listing and project creation. Existing projects are
 * unaffected: workflowFor still resolves disabled modules.
 */
export function setModuleDisabled(id: string, disabledFlag: boolean): { id: string; disabled: boolean } {
  const known = Boolean(WORKFLOWS[id]) || existsSync(userModulePath(id))
  if (!known) fail(`未知模块 ${id}`)
  const config = loadConfig()
  const set = new Set(config.disabled)
  if (disabledFlag) set.add(id)
  else set.delete(id)
  writeJson(configPath(), { schemaVersion: 1, disabled: [...set].sort() })
  return { id, disabled: disabledFlag }
}
