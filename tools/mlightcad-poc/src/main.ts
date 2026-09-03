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
  createSimpleUiPlugin,
  createToolbarSeparator,
  toolbarPreset
} from '@mlightcad/cad-simple-ui-plugin'
import {
  AcDbDatabaseConverterManager,
  AcDbFileType
} from '@mlightcad/data-model'
import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter'
import './styles.css'

const viewerHost = requireElement<HTMLElement>('viewer-host')
const emptyState = requireElement<HTMLElement>('empty-state')
const busyState = requireElement<HTMLElement>('busy-state')
const busyMessage = requireElement<HTMLElement>('busy-message')
const statusMessage = requireElement<HTMLElement>('status-message')
const drawingName = requireElement<HTMLElement>('drawing-name')
const fileInput = requireElement<HTMLInputElement>('file-input')
const openButton = requireElement<HTMLButtonElement>('open-button')
const emptyOpenButton = requireElement<HTMLButtonElement>('empty-open-button')
const externalButton = requireElement<HTMLButtonElement>('external-button')

const pageBaseUrl = new URL('./', window.location.href)
const workerBaseUrl = new URL('workers/', pageBaseUrl)
const resourceBaseUrl = new URL('resources/', pageBaseUrl)
const workerUrls = {
  dwgParser: new URL(LIBREDWG_PARSER_WORKER_FILE, workerBaseUrl),
  mtextRender: new URL(MTEXT_RENDERER_WORKER_FILE, workerBaseUrl)
}
const LOCAL_FALLBACK_FONT = 'Source Han Sans CN'

let manager: AcApDocManager | undefined
let hasOpenedDocument = false

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
}

function setStatus(message: string, isError = false): void {
  statusMessage.textContent = message
  statusMessage.classList.toggle('is-error', isError)
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
          items: [
            toolbarPreset('select'),
            toolbarPreset('pan'),
            toolbarPreset('zoom-extent'),
            createToolbarSeparator('viewer-navigation-end'),
            toolbarPreset('layer'),
            toolbarPreset('measure'),
            createToolbarSeparator('viewer-settings-end'),
            toolbarPreset('switch-bg'),
            toolbarPreset('theme'),
            toolbarPreset('locale')
          ]
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

async function openDrawing(name: string, content: ArrayBuffer): Promise<void> {
  const safeName = normalizeDrawingName(name)
  assertSupportedFileName(safeName)
  setBusy(true, `正在解析 ${safeName}…`)
  setStatus('正在检查离线运行时…')

  try {
    const docManager = await ensureViewer()
    if (hasOpenedDocument) {
      await docManager.closeDocument()
      hasOpenedDocument = false
    }

    setStatus('正在解析图纸，请稍候…')
    const opened = await docManager.openDocument(safeName, content, {
      mode: AcEdOpenMode.Read,
      openViewMode: AcApOpenViewMode.Extents,
      progressiveRendering: true
    })

    if (!opened) {
      throw new Error('MLightCAD 未能打开该图纸。')
    }

    hasOpenedDocument = true
    drawingName.textContent = safeName
    emptyState.hidden = true
    setStatus('图纸已打开 · 只读模式')
    postToParent({ type: 'agent-pi-cad:ready' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus(message, true)
    if (!hasOpenedDocument) emptyState.hidden = false
    throw error
  } finally {
    setBusy(false)
  }
}

async function openSelectedFile(file: File): Promise<void> {
  assertSupportedFileName(file.name)
  await openDrawing(file.name, await file.arrayBuffer())
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

  const response = await fetch(sourceUrl, {
    cache: 'no-store',
    credentials: 'same-origin'
  })
  if (!response.ok) {
    throw new Error(`读取图纸失败：HTTP ${response.status}`)
  }

  const name = params.get('name') || normalizeDrawingName(path || sourceUrl.pathname)
  await openDrawing(name, await response.arrayBuffer())
}

function chooseFile(): void {
  fileInput.click()
}

openButton.addEventListener('click', chooseFile)
emptyOpenButton.addEventListener('click', chooseFile)
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return

  void openSelectedFile(file).catch((error) => {
    reportError(error, 'Failed to open local drawing')
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
