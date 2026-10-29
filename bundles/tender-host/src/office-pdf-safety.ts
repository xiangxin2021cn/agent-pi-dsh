import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { get } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

interface PdfPage {
  setRequestInterception(value: boolean): Promise<void>
  on(event: string, handler: (request: any) => void): unknown
  mainFrame(): unknown
  evaluateOnNewDocument(source: string): Promise<unknown>
  evaluate(source: string): Promise<unknown>
  pdf(...args: any[]): Promise<unknown>
  isClosed(): boolean
}
interface PdfBrowser {
  newPage(...args: any[]): Promise<PdfPage>
  close(): Promise<void>
  process(): { exitCode: number | null; signalCode?: string | null; once(event: string, handler: () => void): unknown } | null
  readonly connected: boolean
}
export interface OfficePdfLauncher { launch(options: Record<string, any>): Promise<PdfBrowser> }
interface SafetyDependencies { service?: unknown; launcher?: OfficePdfLauncher; readHtml?: (url: URL) => Promise<string> }
const context = new AsyncLocalStorage<object>()
let pending = Promise.resolve()
const CSP = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; media-src 'none'"
function failure(message = 'PDF 含外部或不允许的资源，已阻止导出。'): Error {
  return Object.assign(new Error(message), { code: 'OFFICE_PDF_SAFETY', statusCode: 502 })
}

/** Resolve the same ESM entry used by the bundled Office import, never a system browser library. */
export async function resolveOfficePdfLauncher(): Promise<OfficePdfLauncher> {
  const require = createRequire(new URL('../../../vendor/dsh-univer-office/package.json', import.meta.url))
  const entry = require.resolve('puppeteer-core')
  const manifest = require('puppeteer-core/package.json')
  if (manifest.exports?.['.']?.import !== manifest.exports?.['.']?.require) throw failure('Office PDF 浏览器模块入口不一致。')
  return (await import(pathToFileURL(realpathSync(entry)).href)).default
}

function rootDocument(url: URL): boolean {
  return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number(url.port) > 0
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
}
function readLocalHtml(url: URL): Promise<string> {
  if (!rootDocument(url)) return Promise.reject(failure())
  return new Promise((resolve, reject) => {
    const request = get(url, response => {
      if (response.statusCode !== 200 || !response.headers['content-type']?.includes('text/html')) {
        response.resume(); reject(failure('PDF 本地渲染页面不可用。')); return
      }
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > 4 * 1024 * 1024) request.destroy(failure('PDF 本地渲染页面超过限制。'))
        else chunks.push(chunk)
      })
      response.once('error', reject)
      response.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    request.setTimeout(10000, () => request.destroy(failure('PDF 本地渲染页面读取超时。')))
    request.once('error', reject)
  })
}

async function runSafe<T>(operation: () => Promise<T>, dependencies: SafetyDependencies): Promise<T> {
  if (!dependencies.launcher) {
    const office = await import(new URL('../../../vendor/dsh-univer-office/lib/index.js', import.meta.url).href)
    if (!(dependencies.service instanceof office.GatewayUniverService)) throw failure('当前 Office PDF 服务无法安全绑定到应用内置组件。')
  }
  const launcher = dependencies.launcher || await resolveOfficePdfLauncher(), originalLaunch = launcher.launch, token = {}
  const profiles: string[] = [], browsers: Array<{ browser: PdfBrowser; close: () => Promise<void> }> = []
  const tempRoot = realpathSync(tmpdir())
  let blocked = false, launchFailed = false, launches = 0, pagesCreated = 0, pdfAttempts = 0, pdfCalls = 0
  async function securePage(page: PdfPage) {
    let origin: string | undefined
    const marker = '__agentPiPdfViolation_' + randomUUID().replaceAll('-', '')
    await page.setRequestInterception(true)
    await page.evaluateOnNewDocument('Object.defineProperty(globalThis,' + JSON.stringify(marker) + ',{value:{count:0}});globalThis.addEventListener("securitypolicyviolation",()=>globalThis[' + JSON.stringify(marker) + '].count++);')
    page.on('request', async request => {
      try {
        const url = new URL(request.url()), method = request.method(), navigation = request.isNavigationRequest()
        if (method !== 'GET' || navigation && request.frame() !== page.mainFrame()) throw failure()
        if (!origin) {
          if (!navigation || !rootDocument(url)) throw failure()
          origin = url.origin
          const html = await (dependencies.readHtml || readLocalHtml)(url)
          await request.respond({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': CSP, 'cache-control': 'no-store' }, body: html })
          return
        }
        if (navigation && (!rootDocument(url) || url.origin !== origin)) throw failure()
        if (!(url.origin === origin && url.protocol === 'http:' && !url.username && !url.password) && !['data:', 'blob:'].includes(url.protocol)) throw failure()
        await request.continue()
      } catch {
        blocked = true
        try { await request.abort('blockedbyclient') } catch { /* an already rejected request stays failed */ }
      }
    })
    const check = async () => {
      if (!page.isClosed() && Number(await page.evaluate('globalThis[' + JSON.stringify(marker) + ']?.count || 0')) > 0) blocked = true
      if (blocked) throw failure()
    }
    const pdf = page.pdf.bind(page)
    page.pdf = async (...args) => {
      if (++pdfAttempts !== 1) throw failure('PDF 不允许重复打印。')
      await check()
      const bytes = await pdf(...args)
      pdfCalls++
      await check()
      return bytes
    }
    return check
  }
  const wrappedLaunch = async function(options: Record<string, any>) {
    if (context.getStore() !== token) return originalLaunch.call(launcher, options)
    if (process.env.PUPPETEER_DANGEROUS_NO_SANDBOX === 'true') throw failure('PDF 浏览器环境禁用了沙箱，已停止导出。')
    if (++launches !== 1 || Object.keys(options).some(key => !['executablePath', 'headless', 'args'].includes(key)) || options.headless === false) throw failure('PDF 浏览器启动参数不受支持。')
    const sandboxDisabled = /^--(?:no-sandbox|disable-(?:setuid|seccomp-filter|gpu|namespace)-sandbox)(?:=|$)/
    if (!Array.isArray(options.args || []) || (options.args || []).some((arg: unknown) => typeof arg !== 'string' || !['--disable-dev-shm-usage', '--disable-gpu'].includes(arg) && !sandboxDisabled.test(arg))) throw failure('PDF 浏览器参数超出原生打印范围。')
    const profile = mkdtempSync(join(tempRoot, 'agent-pi-office-pdf-'))
    profiles.push(profile)
    const args = (options.args || []).filter((arg: string) => !sandboxDisabled.test(arg))
    let browser: PdfBrowser
    try { browser = await originalLaunch.call(launcher, { ...options, args, headless: true, pipe: true, userDataDir: profile }) }
    catch (error) { launchFailed = true; throw error }
    const close = browser.close.bind(browser), checks: Array<() => Promise<void>> = []
    browsers.push({ browser, close })
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...args) => {
      if (++pagesCreated !== 1) throw failure('PDF 不允许创建额外页面。')
      const page = await newPage(...args)
      checks.push(await securePage(page))
      return page
    }
    browser.close = async () => { try { for (const check of checks) await check() } finally { await close() } }
    return browser
  }
  launcher.launch = wrappedLaunch
  try {
    const result = await context.run(token, operation)
    if (blocked) throw failure()
    if (launches !== 1 || pdfCalls !== 1) throw failure('PDF 未经过完整的原生安全打印链。')
    return result
  } finally {
    const unchanged = launcher.launch === wrappedLaunch
    if (unchanged) launcher.launch = originalLaunch
    let cleanupFailed = !unchanged || launchFailed
    for (const { browser, close } of browsers) {
      try {
        if (browser.connected) await close()
        const child = browser.process()
        if (!child) throw failure('PDF 浏览器缺少自有进程信息。')
        if (child.exitCode === null && !child.signalCode) {
          let timer: ReturnType<typeof setTimeout> | undefined
          try { await Promise.race([new Promise<void>(resolve => child.once('exit', resolve)), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(failure('PDF 浏览器未正常退出。')), 5000) })]) }
          finally { clearTimeout(timer) }
        }
        if (child.exitCode === null && !child.signalCode) throw failure('PDF 浏览器尚未退出。')
      } catch { cleanupFailed = true }
    }
    if (!cleanupFailed) for (const profile of profiles) {
      if (lstatSync(profile).isSymbolicLink() || realpathSync(profile) !== profile || dirname(profile) !== tempRoot || !basename(profile).startsWith('agent-pi-office-pdf-')) throw failure('PDF 临时目录边界已变化，未执行清理。')
      rmSync(profile, { recursive: true })
    }
    if (cleanupFailed) throw failure('PDF 浏览器清理未完成，未删除临时目录。')
  }
}

/** Native PDF callbacks enter this serialized scope; the official callback remains authoritative. */
export function withOfficePdfSafety<T>(operation: () => Promise<T>, dependencies: SafetyDependencies = {}): Promise<T> {
  const run = pending.then(() => runSafe(operation, dependencies))
  pending = run.then(() => {}, () => {})
  return run
}
