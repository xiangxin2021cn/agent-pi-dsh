import {
  AcApDocManager,
  AcApFontUtil,
  AcApOpenViewMode,
  AcEdOpenMode,
  LIBREDWG_PARSER_WORKER_FILE,
  MTEXT_RENDERER_WORKER_FILE,
  acedApplyUiTheme
} from '@mlightcad/cad-simple-viewer'
import {
  createSimpleUiPlugin
} from '@mlightcad/cad-simple-ui-plugin'
import {
  AcDbBlockReference,
  AcDbBlockTableRecord,
  AcDbDatabaseConverterManager,
  AcDbFileType,
  acdbHostApplicationServices
} from '@mlightcad/data-model'
import { AcGeBox2d } from '@mlightcad/geometry-engine'
import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter'
import {
  chooseRobustFitBounds,
  type CadEntityExtent
} from './robust-fit'
import './styles.css'

const viewerHost = requireElement<HTMLElement>('viewer-host')
const emptyState = requireElement<HTMLElement>('empty-state')
const busyState = requireElement<HTMLElement>('busy-state')
const busyMessage = requireElement<HTMLElement>('busy-message')
const statusMessage = requireElement<HTMLElement>('status-message')
const drawingName = requireElement<HTMLElement>('drawing-name')
const fileInput = requireElement<HTMLInputElement>('file-input')
const fontInput = requireElement<HTMLInputElement>('font-input')
const openButton = requireElement<HTMLButtonElement>('open-button')
const emptyOpenButton = requireElement<HTMLButtonElement>('empty-open-button')
const fontButton = requireElement<HTMLButtonElement>('font-button')
const mainFitButton = requireElement<HTMLButtonElement>('main-fit-button')
const externalButton = requireElement<HTMLButtonElement>('external-button')

const pageBaseUrl = new URL('./', window.location.href)
const workerBaseUrl = new URL('workers/', pageBaseUrl)
const resourceBaseUrl = new URL('resources/', pageBaseUrl)
const workerUrls = {
  dwgParser: new URL(LIBREDWG_PARSER_WORKER_FILE, workerBaseUrl),
  mtextRender: new URL(MTEXT_RENDERER_WORKER_FILE, workerBaseUrl)
}
const LOCAL_FALLBACK_FONT = 'Source Han Sans CN'
const BYTES_PER_MIB = 1024 * 1024
const MIN_PARSER_TIMEOUT_MS = 120_000
const MAX_PARSER_TIMEOUT_MS = 600_000
const PARSER_TIMEOUT_PER_MIB_MS = 5_000

let manager: AcApDocManager | undefined
let hasOpenedDocument = false
let openTransactionActive = false
let drawingRevision = 0
let currentDrawing: { name: string; load: () => Promise<ArrayBuffer> } | undefined

type CadFrameMessage =
  | { type: 'agent-pi-cad:ready' }
  | { type: 'agent-pi-cad:error'; message: string }
  | { type: 'agent-pi-cad:open-external' }

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing required element: #${id}`)
  }
  return element as T
}

function setBusy(isBusy: boolean, message = ''): void {
  busyState.hidden = !isBusy
  busyMessage.textContent = message
  openButton.disabled = isBusy
  emptyOpenButton.disabled = isBusy
  fontButton.disabled = isBusy
  mainFitButton.disabled = isBusy || !hasOpenedDocument
}

function setStatus(message: string, isError = false, isWarning = false): void {
  statusMessage.textContent = message
  statusMessage.title = message
  statusMessage.classList.toggle('is-error', isError)
  statusMessage.classList.toggle('is-warning', isWarning && !isError)
}

function postToParent(message: CadFrameMessage): void {
  if (window.parent === window) return
  window.parent.postMessage(message, window.location.origin)
}

function reportError(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[mlightcad-poc] ${context}`, error)
  setStatus(message, true)
  postToParent({ type: 'agent-pi-cad:error', message })
}

function normalizeDrawingName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'drawing.dwg'
  return trimmed.split(/[\\/]/).pop() || 'drawing.dwg'
}

function assertSupportedFileName(name: string): void {
  if (!/\.(dwg|dxf)$/i.test(name)) {
    throw new Error('当前 PoC 只支持 DWG 和 DXF 文件。')
  }
}

function registerDwgConverter(): void {
  AcDbDatabaseConverterManager.instance.register(
    AcDbFileType.DWG,
    new AcDbLibreDwgConverter({
      convertByEntityType: false,
      useWorker: true,
      parserWorkerUrl: workerUrls.dwgParser
    })
  )
}

function normalizeFontName(name: string): string {
  const baseName = name.trim().split(/[\\/]/).pop() || ''
  return baseName.toLowerCase().replace(/\.(?:shx|ttf|otf|woff)$/i, '')
}

function currentMissingFonts(docManager: AcApDocManager): string[] {
  const missed = docManager.curView?.missedData?.fonts ?? {}
  const candidates = new Map<string, string>()
  for (const name of Object.keys(missed)) {
    const normalized = normalizeFontName(name)
    if (normalized) candidates.set(normalized, name)
  }

  const database = docManager.curDocument.database
  const blockTable = database.tables.blockTable
  const textStyleTable = database.tables.textStyleTable
  const textEntityTypes = new Set(['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF', 'SHAPE'])
  const usedStyles = new Set<string>()
  const pendingBlocks: AcDbBlockTableRecord[] = [blockTable.modelSpace]
  const visitedBlocks = new Set<string>()

  for (const block of blockTable.newIterator()) {
    if (block.isPaperSapce) pendingBlocks.push(block)
  }

  const addStyle = (styleName: unknown): void => {
    if (typeof styleName === 'string' && styleName.trim()) {
      usedStyles.add(styleName)
    }
  }

  while (pendingBlocks.length > 0) {
    const block = pendingBlocks.pop()
    if (!block || visitedBlocks.has(block.objectId)) continue
    visitedBlocks.add(block.objectId)

    for (const entity of block.newIterator()) {
      if (textEntityTypes.has(entity.dxfTypeName.toUpperCase())) {
        addStyle((entity as { styleName?: unknown }).styleName)
      }
      if (entity.dxfTypeName.toUpperCase() !== 'INSERT') continue

      const blockReference = entity as AcDbBlockReference
      for (const attribute of blockReference.attributeIterator()) {
        addStyle(attribute.styleName)
      }
      if (blockReference.blockTableRecord) {
        pendingBlocks.push(blockReference.blockTableRecord)
      }
    }
  }

  for (const styleName of usedStyles) {
    const record = textStyleTable.getAt(styleName)
    if (!record) continue
    for (const name of [record.fileName, record.bigFontFileName, record.textStyle?.font]) {
      if (typeof name !== 'string' || !name.trim()) continue
      const normalized = normalizeFontName(name)
      if (normalized && !AcApFontUtil.isFontLoaded(normalized)) {
        candidates.set(normalized, name)
      }
    }
  }

  return [...candidates.values()].sort((left, right) =>
    left.localeCompare(right)
  )
}

async function refreshDrawingStatusWhenIdle(
  docManager: AcApDocManager,
  revision: number
): Promise<void> {
  const view = docManager.curView
  if (!view) return
  try {
    await view.waitUntilIdle()
  } catch (error) {
    console.warn('[mlightcad-poc] Failed to wait for final font status', error)
    return
  }
  refreshDrawingStatus(docManager, revision)
}

function parserTimeoutFor(contentBytes: number): number {
  const sizeInMiB = Math.max(1, Math.ceil(contentBytes / BYTES_PER_MIB))
  return Math.min(
    MAX_PARSER_TIMEOUT_MS,
    Math.max(MIN_PARSER_TIMEOUT_MS, sizeInMiB * PARSER_TIMEOUT_PER_MIB_MS)
  )
}

function currentModelSpaceExtents(docManager: AcApDocManager): CadEntityExtent[] {
  const extents: CadEntityExtent[] = []
  const modelSpace = docManager.curDocument.database.tables.blockTable.modelSpace
  for (const entity of modelSpace.newIterator()) {
    try {
      const bounds = entity.geometricExtents
      extents.push({
        id: entity.objectId,
        type: entity.dxfTypeName,
        min: { x: bounds.min.x, y: bounds.min.y },
        max: { x: bounds.max.x, y: bounds.max.y }
      })
    } catch {
      // Some proxy entities do not expose usable geometric extents.
    }
  }
  return extents
}

async function fitMainContent(): Promise<void> {
  const docManager = manager
  const revision = drawingRevision
  if (!docManager || !hasOpenedDocument) return

  const view = docManager.curView
  const database = docManager.curDocument.database
  const blockTable = database.tables.blockTable
  if (!view) return
  if (view.activeLayoutBtrId !== blockTable.modelSpace.objectId) {
    setStatus('主体取景仅适用于模型空间；当前为图纸布局，请切换到 Model 后重试。', false, true)
    return
  }

  setBusy(true, '正在核对主体范围…')
  try {
    await view.waitUntilIdle()
    if (revision !== drawingRevision || !hasOpenedDocument) return
    if (view.activeLayoutBtrId !== blockTable.modelSpace.objectId) {
      setStatus('主体取景仅适用于模型空间；当前为图纸布局，请切换到 Model 后重试。', false, true)
      return
    }

    const stored = database.extents
    const result = chooseRobustFitBounds(currentModelSpaceExtents(docManager), {
      minX: stored.min.x,
      minY: stored.min.y,
      maxX: stored.max.x,
      maxY: stored.max.y
    })
    if (!result) {
      setStatus('未能取得有效实体范围，当前视图保持不变。', false, true)
      return
    }

    if (result.source === 'full') {
      setStatus('未发现可安全忽略的远端小实体，当前视图保持不变。')
      return
    }

    const { bounds } = result
    view.zoomTo(
      new AcGeBox2d(
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY }
      ),
      1.05
    )

    setStatus(
      `主体取景已应用 · 完整包含 ${result.includedCount}/${result.includedCount + result.excludedCount} 个实体 · ` +
      `${result.excludedCount} 个远端小实体仍保留；使用 Zoom Extents 可恢复全图。`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[mlightcad-poc] Failed to fit main content', error)
    setStatus(`主体取景失败：${message}`, true)
  } finally {
    setBusy(false)
  }
}

function refreshDrawingStatus(
  docManager: AcApDocManager,
  revision: number
): void {
  if (revision !== drawingRevision || !hasOpenedDocument) return
  const view = docManager.curView
  const missed = view?.missedData
  const missingFonts = currentMissingFonts(docManager)
  const missingImages = [...(missed?.images.values() ?? [])]
  const missingXrefs = missed?.xrefs ?? []
  const layoutCount = acdbHostApplicationServices()
    .layoutManager
    .countLayouts(docManager.curDocument.database)
  const resourceSummary = [
    `字体 ${missingFonts.length}`,
    `图像 ${missingImages.length}`,
    `外部参照 ${missingXrefs.length}`
  ].join(' · ')

  const details: string[] = []
  if (missingFonts.length > 0) {
    details.push(`缺少字体：${missingFonts.slice(0, 4).join('、')}`)
  }
  if (missingImages.length > 0) {
    details.push(`缺少图像：${missingImages.slice(0, 3).join('、')}`)
  }
  if (missingXrefs.length > 0) {
    details.push(
      `缺少外部参照：${missingXrefs
        .slice(0, 3)
        .map((xref) => xref.pathName || xref.name)
        .join('、')}`
    )
  }

  if (details.length === 0) {
    setStatus(
      `图纸已打开 · 审阅模式 · 布局 ${layoutCount} · 缺失资源：${resourceSummary}`
    )
    return
  }
  setStatus(
    `图纸已打开 · 审阅模式 · 布局 ${layoutCount} · 缺失资源：${resourceSummary}。${details.join('；')}`,
    false,
    true
  )
}

function inferShxEncoding(fileName: string): string | undefined {
  const name = normalizeFontName(fileName)
  if (name === 'hztxt') return 'gbk'
  if (name === 'gbcbig') return 'gb2312'
  return undefined
}

async function ensureViewer(): Promise<AcApDocManager> {
  if (manager) return manager

  const workersReady = await AcApDocManager.checkWebworkerReadiness(workerUrls)
  if (!workersReady) {
    throw new Error('CAD Worker 或 WASM 资源不可达，请确认以 HTTP 方式提供本目录。')
  }

  registerDwgConverter()
  const theme = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
  acedApplyUiTheme(theme, viewerHost)

  let nextManager = AcApDocManager.createInstance({
    autoResize: true,
    baseUrl: resourceBaseUrl.href,
    builtinOpenFileDialog: false,
    busyIndicatorHost: viewerHost,
    checkWorkersOnInit: false,
    container: viewerHost,
    preloadDefaultFonts: false,
    webworkerFileUrls: workerUrls
  })

  if (!nextManager) {
    nextManager = AcApDocManager.instance
  }

  try {
    await nextManager.loadDefaultFonts([LOCAL_FALLBACK_FONT])
    if (!AcApFontUtil.isFontLoaded(LOCAL_FALLBACK_FONT)) {
      throw new Error('离线 CAD 回退字体加载失败，无法可靠显示图纸文字。')
    }

    await nextManager.pluginManager.loadPlugin(
      createSimpleUiPlugin({
        host: viewerHost,
        dockPanel: {
          defaultOpen: false,
          defaultSide: 'right',
          defaultWidth: 280
        },
        toolbar: {
          placement: 'right',
          items: 'default',
          collapsible: true
        }
      })
    )
  } catch (error) {
    try {
      await nextManager.destroy()
    } catch (destroyError) {
      console.warn('[mlightcad-poc] Failed to reset incomplete viewer', destroyError)
    }
    throw error
  }

  manager = nextManager
  return nextManager
}

async function openDrawing(
  name: string,
  content: ArrayBuffer,
  load: () => Promise<ArrayBuffer>
): Promise<void> {
  const safeName = normalizeDrawingName(name)
  assertSupportedFileName(safeName)
  const revision = ++drawingRevision

  try {
    const docManager = await ensureViewer()
    if (hasOpenedDocument) {
      await docManager.closeDocument()
      hasOpenedDocument = false
    }

    setStatus('正在解析图纸，请稍候…')
    const opened = await docManager.openDocument(safeName, content, {
      mode: AcEdOpenMode.Review,
      minimumChunkSize: 1000,
      openViewMode: AcApOpenViewMode.Extents,
      progressiveRendering: false,
      timeout: parserTimeoutFor(content.byteLength)
    })

    if (!opened) {
      throw new Error('MLightCAD 未能打开该图纸。')
    }

    hasOpenedDocument = true
    currentDrawing = { name: safeName, load }
    drawingName.textContent = safeName
    emptyState.hidden = true
    refreshDrawingStatus(docManager, revision)
    void refreshDrawingStatusWhenIdle(docManager, revision)
    postToParent({ type: 'agent-pi-cad:ready' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus(message, true)
    if (!hasOpenedDocument) emptyState.hidden = false
    throw error
  }
}

async function loadAndOpenDrawing(
  name: string,
  load: () => Promise<ArrayBuffer>
): Promise<void> {
  const safeName = normalizeDrawingName(name)
  assertSupportedFileName(safeName)
  if (openTransactionActive) {
    throw new Error('已有图纸正在打开，请等待当前解析完成。')
  }

  openTransactionActive = true
  setBusy(true, `正在解析 ${safeName}…`)
  setStatus('正在检查离线运行时…')
  try {
    const [content] = await Promise.all([load(), ensureViewer()])
    await openDrawing(safeName, content, load)
  } finally {
    openTransactionActive = false
    setBusy(false)
  }
}

async function openSelectedFile(file: File): Promise<void> {
  const load = () => file.arrayBuffer()
  await loadAndOpenDrawing(file.name, load)
}

async function importFontFiles(files: File[]): Promise<void> {
  if (files.length === 0) return
  setBusy(true, `正在导入 ${files.length} 个字体…`)
  const missing = manager ? currentMissingFonts(manager) : []
  const missingByName = new Map(
    missing.map((name) => [normalizeFontName(name), name])
  )
  const failed: string[] = []

  try {
    for (const file of files) {
      if (!/\.(?:shx|ttf|otf|woff)$/i.test(file.name)) {
        failed.push(file.name)
        continue
      }
      const normalized = normalizeFontName(file.name)
      const alias = missingByName.get(normalized)
      const status = await AcApFontUtil.cacheFont(
        file,
        undefined,
        alias ? [alias] : undefined,
        /\.shx$/i.test(file.name) ? inferShxEncoding(file.name) : undefined
      )
      if (status.status !== 'Success') failed.push(file.name)
    }

    if (failed.length > 0) {
      throw new Error(`以下字体无法导入：${failed.join('、')}`)
    }
    if (currentDrawing) {
      const source = currentDrawing
      await loadAndOpenDrawing(source.name, source.load)
    } else {
      setStatus(`已导入 ${files.length} 个字体；打开图纸后自动使用。`)
    }
  } finally {
    setBusy(false)
  }
}

async function openSameOriginSourceFromQuery(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const cwd = params.get('cwd')
  const path = params.get('path')
  const explicitSource = params.get('src')
  if (!explicitSource && (!cwd || !path)) return

  externalButton.hidden = !(cwd && path)
  const source = explicitSource ||
    `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd || '')}&path=${encodeURIComponent(path || '')}`

  const sourceUrl = new URL(source, window.location.href)
  if (sourceUrl.origin !== window.location.origin) {
    throw new Error('为避免凭据泄露，src 仅允许同源文件地址。')
  }

  const load = async (): Promise<ArrayBuffer> => {
    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      credentials: 'same-origin'
    })
    if (!response.ok) {
      throw new Error(`读取图纸失败：HTTP ${response.status}`)
    }
    return response.arrayBuffer()
  }

  const name = params.get('name') || normalizeDrawingName(path || sourceUrl.pathname)
  await loadAndOpenDrawing(name, load)
}

function chooseFile(): void {
  fileInput.click()
}

function chooseFonts(): void {
  fontInput.click()
}

openButton.addEventListener('click', chooseFile)
emptyOpenButton.addEventListener('click', chooseFile)
fontButton.addEventListener('click', chooseFonts)
mainFitButton.addEventListener('click', () => {
  void fitMainContent()
})
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return

  void openSelectedFile(file).catch((error) => {
    reportError(error, 'Failed to open local drawing')
  })
})
fontInput.addEventListener('change', () => {
  const files = Array.from(fontInput.files ?? [])
  fontInput.value = ''
  void importFontFiles(files).catch((error) => {
    reportError(error, 'Failed to import CAD fonts')
  })
})

externalButton.addEventListener('click', () => {
  postToParent({ type: 'agent-pi-cad:open-external' })
})

window.addEventListener('beforeunload', () => {
  if (manager) void manager.destroy()
})

void openSameOriginSourceFromQuery().catch((error) => {
  reportError(error, 'Failed to open query source')
})
