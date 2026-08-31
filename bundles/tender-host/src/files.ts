import { spawn } from 'node:child_process'
import { basename, dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { OFFICIAL_OUTPUTS_DIR, harvestWorkspaceOutputs, officialOutputsDir } from './outputs.ts'
import { listBusinessProjects } from '../../../packages/business-projects/index.ts'
import { usesTenderControlProfile } from './modules.ts'

export const UPLOADS_DIR = 'Agent Pi Uploads'
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

export type FileSource = 'working-directory' | 'official-output' | 'attachment' | 'tender-workspace'

export interface WorkspaceFile {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  source: FileSource
  relativePath: string
  children?: WorkspaceFile[]
  childrenLoaded?: boolean
  hasMoreChildren?: boolean
}

const HIDDEN = new Set([
  '.git',
  '.agent-pi',
  '.dsh-home',
  'node_modules',
  'session.jsonl',
])

function isVisible(name: string): boolean {
  if (HIDDEN.has(name)) return false
  if (name.startsWith('.') && name !== '.gitignore') return false
  return true
}

export function assertInside(cwd: string, target: string): string {
  const root = resolve(cwd)
  const resolved = resolve(target)
  const prefix = root.endsWith(sep) ? root : root + sep
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new Error('path is outside the workspace')
  }
  return resolved
}

function classify(cwd: string, fullPath: string): FileSource {
  const rel = relative(resolve(cwd), resolve(fullPath)).replaceAll('\\', '/')
  if (rel === OFFICIAL_OUTPUTS_DIR || rel.startsWith(`${OFFICIAL_OUTPUTS_DIR}/`)) return 'official-output'
  if (rel === UPLOADS_DIR || rel.startsWith(`${UPLOADS_DIR}/`)) return 'attachment'
  if (rel.includes('.agent-pi/business/')) return 'tender-workspace'
  return 'working-directory'
}

function hasVisibleEntries(dirPath: string): boolean {
  try {
    return readdirSync(dirPath, { withFileTypes: true }).some((entry) => isVisible(entry.name))
  } catch {
    return false
  }
}

export function scanDirectory(
  cwd: string,
  dirPath: string,
  options: { maxDepth?: number; depth?: number; skipOfficialRoot?: boolean; skipUploadsRoot?: boolean } = {},
): WorkspaceFile[] {
  const maxDepth = options.maxDepth ?? 1
  const depth = options.depth ?? 0
  const root = resolve(cwd)
  const files: WorkspaceFile[] = []
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!isVisible(entry.name)) continue
    if (options.skipOfficialRoot && entry.name === OFFICIAL_OUTPUTS_DIR) continue
    if (options.skipUploadsRoot && entry.name === UPLOADS_DIR) continue
    const fullPath = join(dirPath, entry.name)
    const source = classify(cwd, fullPath)
    const relativePath = relative(root, fullPath)

    if (entry.isDirectory()) {
      const loadChildren = depth < maxDepth
      const children = loadChildren
        ? scanDirectory(cwd, fullPath, { maxDepth, depth: depth + 1 })
        : []
      const hasMoreChildren = loadChildren ? false : hasVisibleEntries(fullPath)
      files.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        source,
        relativePath,
        children,
        childrenLoaded: loadChildren,
        hasMoreChildren,
      })
    } else {
      let size: number | undefined
      try {
        size = statSync(fullPath).size
      } catch {
        size = undefined
      }
      files.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
        size,
        source,
        relativePath,
      })
    }
  }

  return files.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
}

function directoryNode(
  cwd: string,
  name: string,
  dirPath: string,
  source: FileSource,
  options: { maxDepth?: number; skipOfficialRoot?: boolean; skipUploadsRoot?: boolean; allowMissing?: boolean } = {},
): WorkspaceFile | null {
  if (!existsSync(dirPath)) {
    if (!options.allowMissing) return null
    return {
      name,
      path: dirPath,
      type: 'directory',
      source,
      relativePath: relative(resolve(cwd), resolve(dirPath)),
      children: [],
      childrenLoaded: true,
      hasMoreChildren: false,
    }
  }
  const children = scanDirectory(cwd, dirPath, {
    maxDepth: options.maxDepth ?? 1,
    skipOfficialRoot: options.skipOfficialRoot,
    skipUploadsRoot: options.skipUploadsRoot,
  })
  return {
    name,
    path: dirPath,
    type: 'directory',
    source,
    relativePath: relative(resolve(cwd), resolve(dirPath)),
    children,
    childrenLoaded: true,
    hasMoreChildren: false,
  }
}

export { harvestWorkspaceOutputs } from './outputs.ts'

export function listWorkspaceFiles(cwd: string, parentPath?: string): WorkspaceFile[] {
  const root = resolve(cwd)
  if (parentPath) {
    const target = assertInside(cwd, parentPath)
    const stat = statSync(target)
    if (!stat.isDirectory()) return []
    if (classify(cwd, target) === 'official-output') harvestWorkspaceOutputs(cwd)
    return scanDirectory(cwd, target, { maxDepth: 1 })
  }

  harvestWorkspaceOutputs(cwd)

  const trees: WorkspaceFile[] = []
  const official = directoryNode(cwd, 'Official Outputs', join(root, OFFICIAL_OUTPUTS_DIR), 'official-output', {
    maxDepth: 3,
    allowMissing: true,
  })
  if (official) trees.push(official)

  const uploads = directoryNode(cwd, '上传资料', join(root, UPLOADS_DIR), 'attachment')
  if (uploads && uploads.children && uploads.children.length > 0) {
    trees.push(uploads)
  }

  const working = directoryNode(cwd, basename(root) || '工作区', root, 'working-directory', {
    skipOfficialRoot: true,
    skipUploadsRoot: true,
  })
  if (working) trees.push(working)

  for (const project of listBusinessProjects(cwd)) {
    if (project.rootPath && resolve(project.rootPath) !== root) {
      const extra = directoryNode(cwd, `${project.name} · 项目目录`, project.rootPath, 'tender-workspace')
      if (extra) trees.push(extra)
    }
  }

  return trees
}

const MAX_IMPORT_FILES = 200

function collectImportFiles(dirPath: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!isVisible(entry.name)) continue
    if (out.length >= MAX_IMPORT_FILES) return
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) collectImportFiles(fullPath, out)
    else out.push(fullPath)
  }
}

function copyUploadFromDisk(cwd: string, sourcePath: string, relativePath: string): {
  path: string
  relativePath: string
  name: string
  size: number
} {
  const bytes = readFileSync(sourcePath)
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(`${basename(sourcePath)} exceeds ${MAX_UPLOAD_BYTES} bytes`)
  }
  const saved = saveUpload(cwd, relativePath.replace(/\\/g, '/'), bytes)
  return {
    path: saved.path,
    relativePath: saved.relativePath,
    name: basename(saved.path),
    size: bytes.length,
  }
}

export function importExternalPaths(cwd: string, sourcePaths: string[]): Array<{
  path: string
  relativePath: string
  name: string
  size: number
}> {
  const imported: Array<{ path: string; relativePath: string; name: string; size: number }> = []
  for (const raw of sourcePaths) {
    const source = resolve(String(raw || ''))
    if (!source || !existsSync(source)) continue
    const stats = statSync(source)
    if (stats.isDirectory()) {
      const files: string[] = []
      collectImportFiles(source, files)
      const rootName = basename(source)
      for (const fullPath of files) {
        if (imported.length >= MAX_IMPORT_FILES) break
        imported.push(copyUploadFromDisk(cwd, fullPath, join(rootName, relative(source, fullPath))))
      }
    } else if (imported.length < MAX_IMPORT_FILES) {
      imported.push(copyUploadFromDisk(cwd, source, basename(source)))
    }
  }
  return imported
}

export function saveUpload(cwd: string, relativePath: string, bytes: Buffer): { path: string; relativePath: string } {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(`file exceeds ${MAX_UPLOAD_BYTES} bytes`)
  }
  const safeRel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!safeRel || safeRel.includes('..')) throw new Error('invalid relative path')
  const dest = assertInside(cwd, join(cwd, UPLOADS_DIR, safeRel))
  mkdirSync(join(dest, '..'), { recursive: true })
  writeFileSync(dest, bytes)
  return { path: dest, relativePath: relative(resolve(cwd), dest) }
}

export function promoteFile(cwd: string, sourcePath: string, projectId?: string): { dest: string } {
  const source = assertInside(cwd, sourcePath)
  if (!existsSync(source) || statSync(source).isDirectory()) {
    throw new Error('promote requires an existing file')
  }
  const projects = listBusinessProjects(cwd)
  const id = projectId
    || (projects.length === 1 ? projects[0]?.projectId : undefined)
    || projects.find((project) => usesTenderControlProfile(project.module))?.projectId
    || projects[0]?.projectId
    || 'workspace'
  const destDir = officialOutputsDir(cwd, id, 'inbox')
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, basename(source))
  copyFileSync(source, dest)
  return { dest }
}

const TEXT_EXT = new Set([
  'md', 'markdown', 'txt', 'json', 'jsonl', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'html', 'htm', 'css', 'js', 'ts', 'tsx',
  'py', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'log', 'ini', 'toml', 'svg',
])
const HEAD_TEXT_EXT = new Set(['md', 'markdown', 'txt', 'html', 'htm', 'log'])

export function readWorkspaceFile(cwd: string, sourcePath: string, maxBytes = 200_000): {
  path: string
  relativePath: string
  text?: string
  binary?: boolean
  truncated?: boolean
  size: number
} {
  const path = assertInside(cwd, sourcePath)
  const stats = statSync(path)
  if (stats.isDirectory()) throw new Error('not a file')
  const ext = basename(path).split('.').pop()?.toLowerCase() ?? ''
  if (!TEXT_EXT.has(ext)) {
    return { path, relativePath: relative(resolve(cwd), path), binary: true, size: stats.size }
  }
  if (stats.size > maxBytes) {
    if (!HEAD_TEXT_EXT.has(ext)) {
      return { path, relativePath: relative(resolve(cwd), path), binary: true, size: stats.size }
    }
    const fd = openSync(path, 'r')
    try {
      const buf = Buffer.alloc(maxBytes)
      const n = readSync(fd, buf, 0, maxBytes, 0)
      let text = buf.subarray(0, n).toString('utf8')
      const cut = text.lastIndexOf('\n')
      if (cut > Math.floor(maxBytes * 0.6)) text = text.slice(0, cut)
      return {
        path,
        relativePath: relative(resolve(cwd), path),
        text,
        truncated: true,
        size: stats.size,
      }
    } finally {
      closeSync(fd)
    }
  }
  return {
    path,
    relativePath: relative(resolve(cwd), path),
    text: readFileSync(path, 'utf8'),
    size: stats.size,
  }
}

function spawnDetached(command: string, args: string[], verbatim = false): Promise<void> {
  return new Promise((resolveSpawn, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolveSpawn()
    }
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      env: process.env,
      windowsVerbatimArguments: verbatim && process.platform === 'win32',
    })
    child.once('error', (error) => finish(error))
    child.once('spawn', () => {
      child.unref()
      finish()
    })
  })
}

function windowsExplorer(): string {
  const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  return join(root, 'explorer.exe')
}

function toWinPath(raw: string): string {
  return normalize(String(raw || '').replace(/\//g, '\\'))
}

export async function openInFileManager(
  cwd: string,
  targetPath?: string,
  reveal = false,
): Promise<{ ok: true; path: string }> {
  const requested = String(targetPath || cwd || '').trim() || cwd
  return openExistingPath(assertInside(cwd, requested), reveal)
}

/** Open a path that already exists (no workspace fence). Used for KB originals. */
export async function openExistingPath(
  targetPath: string,
  reveal = true,
): Promise<{ ok: true; path: string }> {
  const path = toWinPath(resolve(targetPath))
  if (!existsSync(path)) throw new Error('路径不存在')
  const isDir = statSync(path).isDirectory()
  const selectItem = reveal || !isDir
  if (process.platform === 'win32') {
    const explorer = windowsExplorer()
    const args = selectItem ? [`/select,"${path}"`] : [`"${path}"`]
    await spawnDetached(explorer, args, true)
    return { ok: true, path }
  }
  if (process.platform === 'darwin') {
    await spawnDetached('open', selectItem ? ['-R', path] : [path])
    return { ok: true, path }
  }
  await spawnDetached('xdg-open', [selectItem ? dirname(path) : path])
  return { ok: true, path }
}
