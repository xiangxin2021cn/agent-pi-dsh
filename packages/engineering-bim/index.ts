import { spawn } from 'node:child_process'
import { realpathSync, statSync, existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BimRequest, BimResult, BimEngineOptions } from './types.ts'
export type * from './types.ts'

const worker = fileURLToPath(new URL('./worker.py', import.meta.url))
const bundledPython = fileURLToPath(new URL('../../bundles/engineering-bim/runtime/python/python.exe', import.meta.url))
const inside = (root: string, target: string) => { const value = relative(root, target); return !isAbsolute(value) && value !== '..' && !value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) }
export const BIM_LIMITS = Object.freeze({ fileBytes: 256 * 1024 * 1024, outputBytes: 8 * 1024 * 1024, requestBytes: 1024 * 1024, queryElements: 100, geometryElements: 20, previewTriangles: 20000, geometryTriangles: 50000, generatedElements: 200, timeoutMs: 30000, maximumTimeoutMs: 120000 })

/** No shell or Python code from input. Both processes independently enforce the cwd boundary. */
export async function runBim(cwd: string, request: BimRequest, options: BimEngineOptions = {}): Promise<BimResult> {
  options.signal?.throwIfAborted()
  const root = realpathSync(cwd)
  if (!statSync(root).isDirectory()) throw new Error('BIM 工作目录无效。')
  const input = structuredClone(request)
  if (input.action === 'generate') {
    const target = resolve(root, input.outputPath)
    if (!inside(root, target) || !inside(root, realpathSync(dirname(target)))) throw new Error('BIM 输出必须在当前工作目录内。')
    if (existsSync(target)) throw new Error('BIM 输出已存在，禁止覆盖源文件或已有成果。')
    if (extname(target).toLowerCase() !== '.ifc') throw new Error('BIM 输出需要 .ifc 扩展名。')
    input.outputPath = target
  } else if (input.action !== 'health') {
    const target = realpathSync(resolve(root, input.sourcePath))
    if (!inside(root, target)) throw new Error('IFC 来源超出当前工作目录。请先将授权资料放入工作目录。')
    if (extname(target).toLowerCase() !== '.ifc' || !statSync(target).isFile()) throw new Error('当前仅接受本地 IFC STEP 文件。')
    if (statSync(target).size > BIM_LIMITS.fileBytes) throw new Error('IFC 文件超过 256 MiB 首版处理预算。')
    if (!/^[a-f\d]{64}$/i.test(input.expectedSha256)) throw new Error('IFC 读取需要已登记的源 SHA-256。')
    input.sourcePath = target
  }
  const payload = JSON.stringify({ cwd: root, request: input })
  if (Buffer.byteLength(payload) > BIM_LIMITS.requestBytes) throw new Error('BIM 输入超过 1 MiB 预算。')
  const timeoutMs = options.timeoutMs ?? BIM_LIMITS.timeoutMs
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > BIM_LIMITS.maximumTimeoutMs) throw new Error('BIM 超时预算必须为 1 至 120000 毫秒。')
  const python = options.pythonPath || process.env.AGENT_PI_BIM_PYTHON_PATH || (existsSync(bundledPython) ? bundledPython : 'python')
  return new Promise((resolveResult, reject) => {
    let finished = false, output = '', errors = '', bytes = 0
    const child = spawn(python, ['-I', '-u', worker], { cwd: root, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    const finish = (error?: Error, value?: BimResult) => {
      if (finished) return
      finished = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort)
      if (error) { child.kill(); reject(error) } else resolveResult(value!)
    }
    const timer = setTimeout(() => finish(new Error(`BIM 引擎超过 ${timeoutMs} ms 预算，已停止；本次未形成可用结果。`)), timeoutMs)
    const abort = () => finish(new Error('BIM 操作已取消，未登记计算结果。'))
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > BIM_LIMITS.outputBytes) finish(new Error('BIM 返回结果超过 8 MiB 预算，需缩小元素范围。')); else output += chunk })
    child.stderr.on('data', chunk => { if (errors.length < 4000) errors += chunk.toString('utf8') })
    child.on('error', error => {
      if (input.action === 'health') finish(undefined, { schemaVersion: 1, action: 'health', engine: { name: 'IfcOpenShell', version: '', available: false }, algorithmVersion: 'ifc-bim-v1', reviewStatus: 'needs_review', issues: [{ code: 'engine-unavailable', severity: 'error', message: `Python 引擎不可用：${error.message}` }] })
      else finish(new Error(`BIM 引擎无法启动，请配置 AGENT_PI_BIM_PYTHON_PATH：${error.message}`))
    })
    child.on('close', code => {
      if (finished) return
      try { const result = JSON.parse(output); if (!result.ok) throw new Error(result.error || `BIM 失败 (${code})`); if (code !== 0) throw new Error(`BIM 异常退出 (${code})`); finish(undefined, result.result) }
      catch (error) { finish(new Error(`BIM 引擎失败：${(error as Error).message}${!output && errors ? `；${errors.slice(0, 400)}` : ''}`)) }
    })
    child.stdin.on('error', () => {}) // An unavailable interpreter may close stdin before spawn's error event.
    child.stdin.end(payload)
  })
}
