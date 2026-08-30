import { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBusinessProject, getBusinessProject, listBusinessProjects, unregisterBusinessProject, updateBusinessProjectInputs } from '../../../packages/business-projects/index.ts'
import type { BusinessModuleId } from '../../../packages/business-projects/types.ts'
import {
  workbenchSnapshot,
  prepareStage,
  markForcePass,
  projectSnapshot,
  inspectBoard,
  refreshSourceBriefsAfterRestore,
  completeSetup,
  completeStage,
  decideApprovalStage,
  markDispatched,
  releaseDispatchOffer,
  resetOrchestration,
  organizeDeliverables,
  projectReality,
  resumeUnfinished,
  bindProjectSession,
  projectForBoundSession,
  recordProjectUserRequirement,
  setProjectUserRequirementStatus,
  executionControlState,
} from './orchestration.ts'
import { copyWorkbenchModule, listWorkbenchModules, removeUserModule, saveUserModule, setModuleDisabled, usesTenderControlProfile, workflowFor } from './modules.ts'
import { auditProjectCitations, describeCitation, resolveSourceCitation } from './citations.ts'
import { registerProjectSources } from './workspace.ts'
import { restoreSetupSources } from './setup-restore.ts'
import { adoptPreview, adoptWorkspace } from './adopt.ts'
import { importExternalPaths, listWorkspaceFiles, openExistingPath, openInFileManager, harvestWorkspaceOutputs, promoteFile, readWorkspaceFile, saveUpload } from './files.ts'
import {
  deleteWorkspaceFile,
  exportMarkdownFile,
  previewKind,
  readWorkspaceBinary,
  saveWorkspaceText,
} from './preview-export.ts'
import { inspectPricingSave } from './pricing-recalc.ts'
import { optimizePromptWithLlm, type LlmStreamRuntime } from './prompt-optimize.ts'
import { currentDefaultModel, readVisionImages } from './attachment-context.ts'
import { addKbBytes, addKbContent, addKbFile, createKbFolder, exportKbTransfer, getKbTaskSlugs, importKbPack, importKbTransfer, importKbTransferFromPath, kbOverview, kbSourcePath, moveKbEntry, parseKbEntries, parseKbEntry, readKbChunk, readKbMarkdown, reindexKb, removeKbEntry, removeKbFolder, saveKbMarkdown, searchKb, seedBundledKnowledge, selectKbSlugForSession, setKbTaskSlugs, stageKbBytes, stageKbContent, stageKbFile } from './kb.ts'
import { looksLikeKbTransfer, looksLikeKbTransferPath } from './kb-transfer.ts'
import { clearMineruToken, mineruStatus, probeMineruToken, saveMineruToken } from './mineru.ts'
import { forgetSession, forgetWorkspace, markWorkspaceArchived, readArchiveStore } from './archive-store.ts'
import { ackHostRestart, hostStatus } from './host-status.ts'
import { readSiteFile, sitePreviewUrl } from './html-site.ts'
import { isOfficePreviewKind, readOfficePreview, saveOfficePreview } from './office-preview.ts'
import { readUniverAsset, univerAssetsReady, univerSheetPage } from './univer-assets.ts'
import { isUniverSheetPath, readUniverWorkbook, saveUniverWorkbook, univerSheetUrl } from './univer-workbook.ts'
import {
  isUniverOfficePath,
  openUniverOfficePreview,
  resolveUniverOfficeService,
  univerOfficePreviewKind,
  type UniverOfficeService,
} from './univer-office-open.ts'
import { invalidateWorkspaceStageMemoryForPath, workspaceMemoryImpactForPath } from './stage-memory.ts'

const MAX_KB_UPLOAD_BYTES = 80 * 1024 * 1024

let llmRuntime: LlmStreamRuntime | null = null

export function setHttpLlm(llm?: LlmStreamRuntime): void {
  llmRuntime = llm && typeof llm.stream === 'function' ? llm : null
}

const BRAND_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../tender-web/lib/brand')
const BRAND_FILES: Record<string, string> = {
  'logo.png': 'image/png',
  'hero.png': 'image/png',
  'symbol.png': 'image/png',
  'favicon.svg': 'image/svg+xml',
  'favicon.png': 'image/png',
  'favicon.ico': 'image/x-icon',
  'company.png': 'image/png',
  'company-mark.png': 'image/png',
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// No CORS headers on purpose: the panel API is same-origin (the dsh web UI and the
// Electron shell both load http://127.0.0.1:<port>). Leaving CORS closed keeps other
// origins (drive-by web pages) from reading files or preflighting mutating calls.
function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(json)
}

function sendFile(res: ServerResponse, body: Buffer, mime: string, filename: string, download = false): void {
  const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`
  res.writeHead(200, {
    'content-type': mime,
    'content-disposition': disposition,
    'content-length': body.length,
    'cache-control': filename.startsWith('univer') || mime.includes('javascript') || mime.includes('css')
      ? 'public, max-age=86400'
      : 'no-store',
  })
  res.end(body)
}

function sendHtml(res: ServerResponse, html: string): void {
  const body = Buffer.from(html, 'utf8')
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function createProject(cwd: string, body: {
  module?: BusinessModuleId
  projectId?: string
  name?: string
  rootPath?: string
  createDirectory?: boolean
  inputPaths?: string[]
}) {
  const module = body.module ?? 'tender'
  const projectId = body.projectId ?? `p${Date.now()}`
  const rootPath = body.rootPath || cwd
  const project = createBusinessProject({
    workspaceRootPath: cwd,
    projectId,
    module,
    name: body.name ?? projectId,
    rootPath,
    workflowId: workflowFor(module).id,
    createDirectory: body.createDirectory !== false,
    inputPaths: body.inputPaths ?? [],
  })
  if (usesTenderControlProfile(module)) {
    registerProjectSources(cwd, projectId, { title: project.name, inputPaths: project.inputPaths })
  }
  return project
}

function sendBrand(res: ServerResponse, filename: string): void {
  const name = String(filename || '').split('?')[0].split('#')[0]
  const type = BRAND_FILES[name]
  const file = type ? join(BRAND_DIR, name) : ''
  if (!type || !existsSync(file)) {
    send(res, 404, { error: `unknown brand asset ${filename}` })
    return
  }
  const body = readFileSync(file)
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': body.length,
  })
  res.end(body)
}

export function attachHttp(ctx: {
  webServer?: {
    register: (route: {
      kind: 'prefix' | 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }) => unknown
    tapIndex?: (transform: (html: string) => string) => () => void
  }
  getUniver?: () => UniverOfficeService | null | undefined
}): void {
  const webServer = ctx.webServer
  if (!webServer) return

  webServer.tapIndex?.((html) => html
    .replaceAll('<title>DeepSeek Harness</title>', '<title>Agent Pi</title>')
    .replaceAll('<title>DSH Local Build</title>', '<title>Agent Pi</title>')
    .replaceAll('href="/favicon.svg"', 'href="/api/agent-pi/brand/favicon.png"')
    .replaceAll('src": "/favicon.svg"', 'src": "/api/agent-pi/brand/favicon.png"')
    .replaceAll('"name": "DeepSeek Harness"', '"name": "Agent Pi"')
    .replaceAll('"name": "DSH Local Build"', '"name": "Agent Pi"')
    .replaceAll('"short_name": "DSH"', '"short_name": "Agent Pi"'))

  webServer.register({
    kind: 'prefix',
    path: '/api/agent-pi',
    handler: async (req, res) => {
      try {
        if (req.method === 'OPTIONS') {
          send(res, 204, {})
          return
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (req.method === 'GET' && url.pathname.startsWith('/api/agent-pi/brand/')) {
          sendBrand(res, decodeURIComponent(url.pathname.slice('/api/agent-pi/brand/'.length)))
          return
        }
        if (req.method === 'GET' && url.pathname.startsWith('/api/agent-pi/univer-assets/')) {
          const name = decodeURIComponent(url.pathname.slice('/api/agent-pi/univer-assets/'.length))
          const file = readUniverAsset(name)
          if (!file) {
            send(res, 404, { error: 'univer asset missing: ' + name })
            return
          }
          sendFile(res, file.body, file.mime, file.filename, false)
          return
        }
        if (req.method === 'GET' && url.pathname === '/api/agent-pi/univer-sheet') {
          sendHtml(res, univerSheetPage())
          return
        }
        if (url.pathname === '/api/agent-pi/host-status') {
          if (req.method === 'GET') {
            send(res, 200, hostStatus())
            return
          }
          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}') as { action?: string; at?: number }
            if (body.action === 'ack-restart') {
              send(res, 200, { restart: ackHostRestart(Number(body.at)) })
              return
            }
            send(res, 400, { error: 'unknown host-status action' })
            return
          }
        }
        if (req.method === 'GET' && url.pathname.startsWith('/api/agent-pi/site/')) {
          const file = readSiteFile(url.pathname)
          if (!file) {
            send(res, 404, { error: 'site file not found' })
            return
          }
          sendFile(res, file.body, file.mime, file.filename, false)
          return
        }
        // Knowledge base is a global store (lives under DSH_HOME), independent of any
        // workspace cwd, so these routes sit before the cwd guard.
        if (url.pathname === '/api/agent-pi/kb/mineru') {
          if (req.method === 'GET') {
            send(res, 200, mineruStatus())
            return
          }
          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}') as { token?: string; action?: string }
            if (body.action === 'clear') {
              send(res, 200, clearMineruToken())
              return
            }
            if (body.action === 'probe') {
              send(res, 200, await probeMineruToken(body.token ? String(body.token) : undefined))
              return
            }
            send(res, 200, saveMineruToken(String(body.token ?? '')))
            return
          }
        }
        if (url.pathname === '/api/agent-pi/kb/content' && req.method === 'GET') {
          send(res, 200, readKbMarkdown(String(url.searchParams.get('slug') || '')))
          return
        }
        if (url.pathname === '/api/agent-pi/kb/transfer') {
          if (req.method === 'GET') {
            const slugs = String(url.searchParams.get('slugs') || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean)
            const skillSlugs = String(url.searchParams.get('skillSlugs') || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean)
            const folderId = String(url.searchParams.get('folderId') || '').trim()
            const exported = exportKbTransfer({
              slugs: slugs.length ? slugs : undefined,
              skillSlugs: skillSlugs.length ? skillSlugs : undefined,
              folderId: folderId || undefined,
            })
            sendFile(res, exported.body, exported.mime, exported.filename, true)
            return
          }
          if (req.method === 'POST') {
            const contentType = String(req.headers['content-type'] || '')
            if (contentType.includes('application/json')) {
              const body = JSON.parse(await readBody(req) || '{}') as { path?: string }
              const path = String(body.path ?? '')
              if (!path || !isAbsolute(path)) {
                send(res, 400, { error: '请选择 .apkb 传递包' })
                return
              }
              send(res, 200, importKbTransferFromPath(path))
              return
            }
            const bytes = await readBuffer(req)
            if (bytes.length > MAX_KB_UPLOAD_BYTES) {
              send(res, 413, { error: `传递包超过 ${Math.round(MAX_KB_UPLOAD_BYTES / 1024 / 1024)}MB` })
              return
            }
            send(res, 200, importKbTransfer(bytes))
            return
          }
        }
        if (url.pathname === '/api/agent-pi/kb/bytes' && req.method === 'POST') {
          const bytes = await readBuffer(req)
          if (bytes.length > MAX_KB_UPLOAD_BYTES) {
            send(res, 413, { error: `文件超过 ${Math.round(MAX_KB_UPLOAD_BYTES / 1024 / 1024)}MB，请拆分后再入库` })
            return
          }
          if (looksLikeKbTransfer(bytes)) {
            send(res, 200, importKbTransfer(bytes))
            return
          }
          const payload = {
            fileName: String(url.searchParams.get('fileName') || ''),
            bytes,
            name: url.searchParams.get('name') || undefined,
            category: url.searchParams.get('category') || undefined,
            slug: url.searchParams.get('slug') || undefined,
            folderId: url.searchParams.get('folderId') || undefined,
            folderName: url.searchParams.get('folderName') || undefined,
          }
          const added = url.searchParams.get('stage') === '1' ? stageKbBytes(payload) : addKbBytes(payload)
          send(res, 200, {
            ...added,
            selectedSlugs: added.staged
              ? getKbTaskSlugs(url.searchParams.get('sessionId') || undefined)
              : selectKbSlugForSession(url.searchParams.get('sessionId') || undefined, added.entry.slug),
          })
          return
        }
        if (url.pathname === '/api/agent-pi/kb') {
          if (req.method === 'GET') {
            seedBundledKnowledge()
            const sessionId = String(url.searchParams.get('sessionId') || '')
            send(res, 200, { ...kbOverview(), selectedSlugs: getKbTaskSlugs(sessionId), mineru: mineruStatus() })
            return
          }
          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}') as {
              action?: string
              path?: string
              fileName?: string
              text?: string
              name?: string
              category?: string
              slug?: string
              slugs?: string[]
              sessionId?: string
              chunkId?: string
              query?: string
              limit?: number
              token?: string
              folderId?: string
              folderName?: string
              force?: boolean
              preferMineru?: boolean
            }
            const action = body.action || 'list'
            if (action === 'read') {
              send(res, 200, readKbChunk(String(body.slug ?? ''), String(body.chunkId ?? '')))
              return
            }
            if (action === 'import-pack') {
              const path = String(body.path ?? '')
              if (!path || !isAbsolute(path)) {
                send(res, 400, { error: '请选择知识包文件夹、pack.json 或 manuscript.md' })
                return
              }
              const imported = importKbPack({
                path,
                name: body.name ? String(body.name) : undefined,
                category: body.category ? String(body.category) : undefined,
                slug: body.slug ? String(body.slug) : undefined,
                folderId: body.folderId ? String(body.folderId) : undefined,
                folderName: body.folderName ? String(body.folderName) : undefined,
              })
              send(res, 200, {
                ...imported,
                selectedSlugs: selectKbSlugForSession(body.sessionId, imported.entry.slug),
              })
              return
            }
            if (action === 'add' || action === 'stage') {
              const stageOnly = action === 'stage'
              const fileName = String(body.fileName ?? '')
              const text = typeof body.text === 'string' ? body.text : ''
              const added = fileName && text
                ? (stageOnly ? stageKbContent : addKbContent)({
                  fileName,
                  text,
                  name: body.name ? String(body.name) : undefined,
                  category: body.category ? String(body.category) : undefined,
                  slug: body.slug ? String(body.slug) : undefined,
                  sourcePath: body.path && isAbsolute(String(body.path)) ? String(body.path) : undefined,
                  folderId: body.folderId ? String(body.folderId) : undefined,
                  folderName: body.folderName ? String(body.folderName) : undefined,
                })
                : null
              if (added) {
                send(res, 200, {
                  ...added,
                  selectedSlugs: added.staged
                    ? getKbTaskSlugs(body.sessionId)
                    : selectKbSlugForSession(body.sessionId, added.entry.slug),
                })
                return
              }
              const path = String(body.path ?? '')
              if (!path || !isAbsolute(path)) {
                send(res, 400, { error: '请选择要入库的文件' })
                return
              }
              if (looksLikeKbTransferPath(path)) {
                send(res, 200, importKbTransferFromPath(path))
                return
              }
              const fromPath = (stageOnly ? stageKbFile : addKbFile)({
                path,
                name: body.name ? String(body.name) : undefined,
                category: body.category ? String(body.category) : undefined,
                slug: body.slug ? String(body.slug) : undefined,
                folderId: body.folderId ? String(body.folderId) : undefined,
                folderName: body.folderName ? String(body.folderName) : undefined,
              })
              send(res, 200, {
                ...fromPath,
                selectedSlugs: fromPath.staged
                  ? getKbTaskSlugs(body.sessionId)
                  : selectKbSlugForSession(body.sessionId, fromPath.entry.slug),
              })
              return
            }
            if (action === 'parse') {
              const slugs = Array.isArray(body.slugs)
                ? body.slugs.map(String)
                : (body.slug ? [String(body.slug)] : [])
              const force = body.force === true || body.preferMineru === true
              const parsed = slugs.length === 1
                ? (() => {
                    const result = parseKbEntry(slugs[0]!, force ? { force: true } : undefined)
                    return {
                      started: result.skipped ? [] : [slugs[0]!],
                      skipped: result.skipped ? [slugs[0]!] : [],
                      results: [result],
                    }
                  })()
                : parseKbEntries(slugs.length ? slugs : undefined, force ? { force: true } : undefined)
              send(res, 200, parsed)
              return
            }
            if (action === 'save-content') {
              const saved = saveKbMarkdown(String(body.slug ?? ''), String(body.text ?? ''))
              send(res, 200, {
                ...saved,
                selectedSlugs: selectKbSlugForSession(body.sessionId, saved.entry.slug),
              })
              return
            }
            if (action === 'open-source') {
              send(res, 200, await openExistingPath(kbSourcePath(String(body.slug ?? ''))))
              return
            }
            if (action === 'mineru-save') {
              send(res, 200, saveMineruToken(String(body.token ?? '')))
              return
            }
            if (action === 'mineru-clear') {
              send(res, 200, clearMineruToken())
              return
            }
            if (action === 'mineru-probe') {
              send(res, 200, await probeMineruToken(body.token ? String(body.token) : undefined))
              return
            }
            if (action === 'folder-create') {
              send(res, 200, { folder: createKbFolder(String(body.category ?? ''), String(body.name ?? '')) })
              return
            }
            if (action === 'folder-remove') {
              send(res, 200, removeKbFolder(String(body.folderId ?? '')))
              return
            }
            if (action === 'folder-move') {
              send(res, 200, moveKbEntry(String(body.slug ?? ''), String(body.folderId ?? '')))
              return
            }
            if (action === 'remove') {
              send(res, 200, removeKbEntry(String(body.slug ?? '')))
              return
            }
            if (action === 'reindex') {
              send(res, 200, reindexKb(body.slug ? String(body.slug) : undefined))
              return
            }
            if (action === 'search') {
              seedBundledKnowledge()
              send(res, 200, { hits: searchKb(String(body.query ?? ''), { limit: body.limit ? Number(body.limit) : undefined }) })
              return
            }
            if (action === 'select') {
              const slugs = Array.isArray(body.slugs)
                ? body.slugs.map(String)
                : (body.slug ? [String(body.slug)] : [])
              send(res, 200, { selectedSlugs: setKbTaskSlugs(body.sessionId, slugs) })
              return
            }
            seedBundledKnowledge()
            send(res, 200, { ...kbOverview(), mineru: mineruStatus() })
            return
          }
        }
        // Module definitions are a global store (user modules live under DSH_HOME),
        // independent of any workspace cwd, so this route also sits before the cwd guard.
        if (url.pathname === '/api/agent-pi/modules') {
          if (req.method === 'GET') {
            send(res, 200, listWorkbenchModules({ includeDisabled: true }))
            return
          }
          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}') as {
              action?: string
              id?: string
              newId?: string
              labelZh?: string
              disabled?: boolean
              definition?: unknown
            }
            const action = body.action || 'list'
            if (action === 'save') {
              send(res, 200, saveUserModule(body.definition))
              return
            }
            if (action === 'copy') {
              send(res, 200, copyWorkbenchModule(String(body.id ?? ''), {
                id: body.newId,
                labelZh: body.labelZh,
              }))
              return
            }
            if (action === 'remove') {
              send(res, 200, removeUserModule(String(body.id ?? '')))
              return
            }
            if (action === 'set_enabled') {
              send(res, 200, setModuleDisabled(String(body.id ?? ''), body.disabled === true))
              return
            }
            send(res, 200, listWorkbenchModules({ includeDisabled: true }))
            return
          }
        }
        if (url.pathname === '/api/agent-pi/archive') {
          if (req.method === 'GET') {
            send(res, 200, readArchiveStore())
            return
          }
          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req) || '{}') as {
              action?: string
              sessionId?: string
              workspaceId?: string
            }
            const action = body.action || 'list'
            if (action === 'forget_session') {
              send(res, 200, forgetSession(String(body.sessionId || '')))
              return
            }
            if (action === 'forget_workspace') {
              send(res, 200, forgetWorkspace(String(body.workspaceId || '')))
              return
            }
            if (action === 'mark_workspace') {
              send(res, 200, markWorkspaceArchived(String(body.workspaceId || '')))
              return
            }
            send(res, 200, readArchiveStore())
            return
          }
        }
        if (url.pathname === '/api/agent-pi/llm/vision/read' && req.method === 'POST') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            message?: string
            images?: Array<{ name?: string; path?: string }>
            files?: Array<{ name?: string; path?: string; relativePath?: string; kind?: 'image' | 'file' | 'folder' }>
            folders?: Array<{ name?: string; path?: string }>
            cwd?: string
            sessionId?: string
          }
          const cwd = url.searchParams.get('cwd') || body.cwd || ''
          const sessionId = url.searchParams.get('sessionId') || body.sessionId || ''
          if (!cwd || !isAbsolute(cwd) || !sessionId.trim()) {
            send(res, 400, { error: 'cwd and sessionId are required' })
            return
          }
          send(res, 200, await readVisionImages({ ...body, cwd, sessionId: sessionId.trim() }))
          return
        }
        const cwd = url.searchParams.get('cwd') ?? ''
        if (!cwd || !isAbsolute(cwd)) {
          send(res, 400, { error: 'cwd query parameter is required (absolute workspace path)' })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/workbench') {
          send(res, 200, workbenchSnapshot(cwd, url.searchParams.get('module') ?? undefined))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/citations') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            action?: string
            path?: string
            token?: string
            projectId?: string
            module?: string
          }
          if (body.action === 'audit') {
            const project = getBusinessProject(cwd, body.module ?? 'tender', String(body.projectId ?? ''))
            if (!project) {
              send(res, 404, { error: `project ${body.module ?? 'tender'}/${body.projectId} not found` })
              return
            }
            send(res, 200, auditProjectCitations(cwd, project))
            return
          }
          if (body.action === 'locator') {
            const token = String(body.token ?? body.path ?? '')
            if (!token) {
              send(res, 400, { error: 'token is required' })
              return
            }
            const preferred = body.projectId
              ? getBusinessProject(cwd, body.module ?? 'tender', String(body.projectId))
              : null
            send(res, 200, describeCitation(cwd, preferred ?? listBusinessProjects(cwd)[0] ?? null, token))
            return
          }
          // resolve: find the cited file for a [src:...] chip click; try the named
          // project first, then every project in this workspace.
          const rawPath = String(body.path ?? '')
          if (!rawPath) {
            send(res, 400, { error: 'path is required' })
            return
          }
          const candidates = listBusinessProjects(cwd)
          const preferred = body.projectId
            ? candidates.filter((project) => project.projectId === body.projectId)
            : []
          let resolved: string | null = null
          for (const project of [...preferred, ...candidates]) {
            resolved = resolveSourceCitation(cwd, project, rawPath)
            if (resolved) break
          }
          if (!resolved) {
            // Project-free fallback so chips work in previews outside any project.
            const direct = isAbsolute(rawPath) ? resolve(rawPath) : resolve(cwd, rawPath)
            if (existsSync(direct)) resolved = direct
          }
          const cwdPrefix = cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
          const normalized = resolved ? resolved.replace(/\\/g, '/').toLocaleLowerCase() : ''
          send(res, 200, {
            path: resolved,
            exists: Boolean(resolved),
            insideWorkspace: Boolean(resolved) && (normalized === cwdPrefix || normalized.startsWith(cwdPrefix + '/')),
          })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/projects/adopt-preview') {
          send(res, 200, adoptPreview(cwd, url.searchParams.get('module') || undefined))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/projects') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            action?: string
            module?: BusinessModuleId
            projectId?: string
            name?: string
            rootPath?: string
            createDirectory?: boolean
            inputPaths?: string[]
          }
          if (body.action === 'adopt') {
            if (!body.module) {
              send(res, 400, { error: '升级必须指定专业模块' })
              return
            }
            send(res, 200, adoptWorkspace(cwd, {
              module: body.module,
              name: body.name,
              projectId: body.projectId,
              inputPaths: body.inputPaths,
            }))
            return
          }
          const project = createProject(cwd, body)
          send(res, 200, projectSnapshot(cwd, project))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/projects/restore') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            module?: BusinessModuleId
            projectId?: string
            paths?: string[]
            force?: boolean
            preferMineru?: boolean
          }
          const module = body.module ?? 'tender'
          const projectId = String(body.projectId ?? '')
          const project = getBusinessProject(cwd, module, projectId)
          if (!project) {
            send(res, 404, { error: `project ${module}/${projectId} not found` })
            return
          }
          const batch = await restoreSetupSources(cwd, projectId, project.inputPaths, {
            paths: Array.isArray(body.paths) ? body.paths.map(String) : undefined,
            force: body.force === true,
            preferMineru: body.preferMineru === true,
          })
          inspectBoard(cwd, project)
          if (batch.restored.length > 0) refreshSourceBriefsAfterRestore(cwd, project)
          send(res, 200, { ...batch, project: projectSnapshot(cwd, project) })
          return
        }

        if (req.method === 'PATCH' && url.pathname === '/api/agent-pi/projects') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            module?: BusinessModuleId
            projectId?: string
            inputPaths?: string[]
          }
          const module = body.module ?? 'tender'
          const projectId = String(body.projectId ?? '')
          const updated = updateBusinessProjectInputs(cwd, module, projectId, body.inputPaths ?? [])
          if (usesTenderControlProfile(module)) {
            registerProjectSources(cwd, projectId, { title: updated.name, inputPaths: updated.inputPaths })
          }
          inspectBoard(cwd, updated)
          send(res, 200, projectSnapshot(cwd, updated))
          return
        }

        if (req.method === 'DELETE' && url.pathname === '/api/agent-pi/projects') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            module?: BusinessModuleId
            projectId?: string
          }
          const module = body.module ?? 'tender'
          const projectId = String(body.projectId ?? url.searchParams.get('projectId') ?? '')
          unregisterBusinessProject(cwd, module, projectId)
          send(res, 200, { ok: true, projectId, module })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/session-project') {
          const sessionId = String(url.searchParams.get('sessionId') || '').trim()
          const project = sessionId ? projectForBoundSession(cwd, sessionId) : null
          send(res, 200, {
            binding: project
              ? { sessionId, module: project.module, projectId: project.projectId, cwd }
              : null,
          })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/stage') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            action?: string
            module?: BusinessModuleId
            projectId?: string
            stageId?: string
            key?: string
            sessionId?: string
            decision?: 'approved' | 'rejected'
            note?: string
            text?: string
            requirementId?: string
            evidencePaths?: string[]
          }
          const module = body.module ?? 'tender'
          const projectId = String(body.projectId ?? '')
          const project = getBusinessProject(cwd, module, projectId)
          if (!project) {
            send(res, 404, { error: `project ${module}/${projectId} not found` })
            return
          }
          const stageId = body.stageId ?? workflowFor(module).stages[0]?.id ?? 'project-setup'
          const action = body.action || 'prepare'
          const selectedKnowledgeSlugs = getKbTaskSlugs(body.sessionId)
          if (body.sessionId) bindProjectSession(cwd, project, body.sessionId, body.stageId || '')
          if (action === 'bind_session') {
            send(res, 200, { binding: { sessionId: body.sessionId, module, projectId, cwd }, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'record_requirement') {
            const recorded = recordProjectUserRequirement(cwd, project, {
              sessionId: String(body.sessionId || ''),
              stageId: body.stageId,
              text: String(body.text || ''),
            })
            send(res, 200, { ...recorded, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'satisfy_requirement' || action === 'accept_requirement'
            || action === 'dismiss_requirement' || action === 'reopen_requirement') {
            const status = action === 'satisfy_requirement' ? 'implemented'
              : action === 'accept_requirement' ? 'accepted'
                : action === 'dismiss_requirement' ? 'dismissed'
                  : 'active'
            const updated = setProjectUserRequirementStatus(
              cwd,
              project,
              String(body.requirementId || ''),
              status,
              { note: body.note, evidencePaths: body.evidencePaths },
            )
            send(res, 200, { ...updated, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'force_pass') {
            send(res, 200, { state: markForcePass(cwd, projectId, stageId), project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'status' || action === 'inspect') {
            const board = inspectBoard(cwd, project)
            send(res, 200, {
              board,
              control: executionControlState(cwd, project, String(body.sessionId || '')),
              project: projectSnapshot(cwd, project),
            })
            return
          }
          if (action === 'check') {
            const reality = projectReality(cwd, project)
            send(res, 200, {
              reality,
              control: executionControlState(cwd, project, String(body.sessionId || ''), reality),
              project: projectSnapshot(cwd, project),
            })
            return
          }
          if (action === 'complete') {
            const completed = completeSetup(cwd, project, selectedKnowledgeSlugs)
            send(res, 200, { ...completed, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'complete_stage') {
            const completed = completeStage(cwd, project, stageId)
            send(res, 200, { ...completed, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'approve_gate' || action === 'reject_gate') {
            const decision = action === 'approve_gate' ? 'approved' : 'rejected'
            const decided = decideApprovalStage(cwd, project, stageId, decision, String(body.note ?? ''))
            send(res, 200, { ...decided, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'mark_dispatched') {
            const marked = markDispatched(cwd, project, stageId, String(body.key ?? ''))
            send(res, 200, { ...marked, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'release_dispatch') {
            const released = releaseDispatchOffer(cwd, project, stageId, String(body.key ?? ''))
            send(res, 200, { ...released, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'reset_orchestration' || action === 'reset') {
            const reset = resetOrchestration(cwd, project, stageId)
            send(res, 200, { ...reset, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'organize_deliverables' || action === 'organize') {
            const organized = organizeDeliverables(cwd, project, stageId)
            send(res, 200, { ...organized, project: projectSnapshot(cwd, project) })
            return
          }
          if (action === 'resume') {
            const resumed = resumeUnfinished(cwd, project, selectedKnowledgeSlugs, { sessionId: body.sessionId })
            send(res, 200, { ...resumed, project: projectSnapshot(cwd, project) })
            return
          }
          const prepared = prepareStage(cwd, project, stageId, selectedKnowledgeSlugs)
          send(res, 200, {
            ...prepared,
            project: projectSnapshot(cwd, project),
          })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/projects') {
          send(res, 200, { projects: listBusinessProjects(cwd) })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/files') {
          send(res, 200, { files: listWorkspaceFiles(cwd, url.searchParams.get('parentPath') ?? undefined) })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/files/univer') {
          const path = url.searchParams.get('path') ?? ''
          send(res, 200, { workbook: readUniverWorkbook(cwd, path) })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/files/content') {
          const path = url.searchParams.get('path') ?? ''
          const kind = previewKind(path)
          // Office must not fall through to the 200KB text reader. A stale
          // previewKind() that still maps xlsx→binary would otherwise show
          // “二进制文件无法在预览中排版”.
          const officeLike = isOfficePreviewKind(kind)
            || isUniverSheetPath(path)
            || isUniverOfficePath(path)
            || /\.(xlsx|csv|tsv|docx|pptx|xls|doc|ppt|univer)$/i.test(path)
          if (officeLike) {
            if (isUniverOfficePath(path)) {
              try {
                const official = await openUniverOfficePreview(
                  await resolveUniverOfficeService(ctx.getUniver),
                  cwd,
                  path,
                )
                if (official?.viewerUrl) {
                  send(res, 200, {
                    kind: univerOfficePreviewKind(path),
                    path,
                    engine: 'univer-office',
                    viewerUrl: official.viewerUrl,
                    univerFile: official.file,
                    editable: true,
                    hint: '右侧已打开 Univer 完全体。改动保存在 Univer 草稿里。',
                  })
                  return
                }
              } catch {
                // Official Gateway is optional. Office files still fall through
                // to the slim preview when import or Gateway start fails.
              }
              if (/\.univer$/i.test(path)) {
                send(res, 200, {
                  kind: 'spreadsheet',
                  path,
                  editable: false,
                  hint: '官方 Univer 还没就绪。请稍后再点，或在对话里打开这个 .univer。',
                })
                return
              }
            }
            const preview = readOfficePreview(cwd, path)
            const nextKind = isOfficePreviewKind(kind) ? kind : preview.kind
            const univer = nextKind === 'spreadsheet' && isUniverSheetPath(path) && univerAssetsReady()
            send(res, 200, {
              ...preview,
              kind: nextKind,
              engine: univer ? 'univer' : undefined,
              viewerUrl: univer ? univerSheetUrl(cwd, path) : undefined,
              editable: univer ? true : preview.editable,
              hint: univer
                ? '官方完全体还没挂上，右侧先用精简表格。可改格子、底部切表，保存写回这个文件。'
                : preview.hint,
            })
            return
          }
          const maxBytes = kind === 'markdown' || kind === 'text' || kind === 'html' ? 8_000_000 : 200_000
          const file = readWorkspaceFile(cwd, path, maxBytes)
          send(res, 200, {
            ...file,
            kind,
            siteUrl: kind === 'html' ? sitePreviewUrl(cwd, path) : undefined,
          })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/agent-pi/files/raw') {
          const path = url.searchParams.get('path') ?? ''
          const file = readWorkspaceBinary(cwd, path)
          sendFile(res, file.body, file.mime, file.filename, false)
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/pricing/sensitive-diff') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            path?: string
            content?: string
            previous?: string
          }
          send(res, 200, inspectPricingSave(cwd, String(body.path ?? ''), String(body.content ?? ''), body.previous))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/memory/impact') {
          const body = JSON.parse(await readBody(req) || '{}') as { path?: string }
          send(res, 200, workspaceMemoryImpactForPath(cwd, String(body.path ?? '')))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/save') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            path?: string
            content?: string
            recalculate?: boolean
            projectId?: string
            univer?: Parameters<typeof saveUniverWorkbook>[2]
            office?: { kind?: string; sheets?: Array<{ name: string; rows: string[][] }>; paragraphs?: string[]; slides?: Array<{ name: string; texts: string[] }> }
          }
          if (body.univer) {
            const path = String(body.path ?? '')
            const saved = saveUniverWorkbook(cwd, path, body.univer)
            send(res, 200, { ...saved, memoryImpact: invalidateWorkspaceStageMemoryForPath(cwd, path) })
            return
          }
          if (body.office) {
            const path = String(body.path ?? '')
            const saved = saveOfficePreview(cwd, path, body.office)
            send(res, 200, { ...saved, memoryImpact: invalidateWorkspaceStageMemoryForPath(cwd, path) })
            return
          }
          send(res, 200, saveWorkspaceText(cwd, String(body.path ?? ''), String(body.content ?? ''), {
            recalculate: body.recalculate === true,
            projectId: body.projectId,
          }))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/delete') {
          const body = JSON.parse(await readBody(req) || '{}') as { path?: string }
          const path = String(body.path ?? '')
          const deleted = deleteWorkspaceFile(cwd, path)
          send(res, 200, { ...deleted, memoryImpact: invalidateWorkspaceStageMemoryForPath(cwd, path) })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/export') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            path?: string
            format?: 'md' | 'html' | 'pdf' | 'docx'
            content?: string
          }
          const format = body.format === 'pdf' || body.format === 'docx' || body.format === 'html' || body.format === 'md'
            ? body.format
            : 'md'
          const exported = exportMarkdownFile(cwd, String(body.path ?? ''), format, body.content)
          sendFile(res, exported.body, exported.mime, exported.filename, true)
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/upload') {
          const relativePath = url.searchParams.get('relativePath') ?? ''
          const bytes = await readBuffer(req)
          send(res, 200, saveUpload(cwd, relativePath, bytes))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/import') {
          const body = JSON.parse(await readBody(req) || '{}') as { paths?: string[] }
          send(res, 200, { files: importExternalPaths(cwd, body.paths ?? []) })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/promote') {
          const body = JSON.parse(await readBody(req) || '{}') as { path?: string; projectId?: string }
          send(res, 200, promoteFile(cwd, String(body.path ?? ''), body.projectId))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/open') {
          const body = JSON.parse(await readBody(req) || '{}') as { path?: string; reveal?: boolean }
          send(res, 200, await openInFileManager(cwd, body.path, Boolean(body.reveal)))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/files/harvest') {
          const body = JSON.parse(await readBody(req) || '{}') as { paths?: string[] }
          send(res, 200, harvestWorkspaceOutputs(cwd, Array.isArray(body.paths) ? body.paths : []))
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/agent-pi/optimize-prompt') {
          const body = JSON.parse(await readBody(req) || '{}') as {
            input?: string
            attachments?: Array<{ name: string; type?: string; size?: number }>
            provider?: string
            model?: string
            connectionName?: string
            reasoningEffort?: string
          }
          const current = currentDefaultModel()
          send(res, 200, await optimizePromptWithLlm({
            input: String(body.input ?? ''),
            attachments: body.attachments,
            workingDirectory: cwd,
            provider: String(body.provider || current?.provider || ''),
            model: String(body.model || current?.id || ''),
            connectionName: String(body.connectionName || current?.name || ''),
            reasoningEffort: body.reasoningEffort,
          }, llmRuntime))
          return
        }

        send(res, 404, { error: `unknown ${req.method} ${url.pathname}` })
      } catch (error) {
        send(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}
