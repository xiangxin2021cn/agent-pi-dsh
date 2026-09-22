import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdtemp, open, readFile, realpath, rm, stat } from 'node:fs/promises'
import { basename, delimiter, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const runtime = fileURLToPath(new URL('../../project-plan/runtime/', import.meta.url))
const formats = Object.freeze({ mspdi: '.xml', pmxml: '.pmxml', xer: '.xer' })
const MAX_BYTES = 80 * 1024 * 1024
let activeEngines = 0

function xmlText(bytes) {
  // MPXJ also accepts UTF-16 XML. Strip interleaved NULs for the ASCII-only
  // format/DTD scan, including UTF-16/32 documents without a byte-order mark.
  return bytes.toString('utf8').replaceAll('\0', '')
}

async function inside(cwd, path) {
  const root = await realpath(resolve(cwd))
  const actual = await realpath(resolve(root, path))
  const rel = relative(root, actual)
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
    throw new Error('计划文件必须位于当前工作区内')
  }
  return actual
}

export async function isProjectPlan(cwd, path) {
  const ext = extname(path).toLowerCase()
  if (['.mpp', '.xer', '.pmxml'].includes(ext)) return true
  if (ext !== '.xml') return false
  const file = await inside(cwd, path)
  const info = await stat(file)
  if (info.size > MAX_BYTES) return false
  const handle = await open(file, 'r')
  let head
  try {
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    head = xmlText(buffer.subarray(0, bytesRead))
  } finally { await handle.close() }
  return /schemas\.microsoft\.com\/project|primavera\.com\/P6\/|<APIBusinessObjects\b/.test(head)
}

async function sourceInfo(cwd, path) {
  const source = await inside(cwd, path)
  const info = await stat(source)
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('计划文件须为不超过 80 MB 的普通文件')
  if (!await isProjectPlan(cwd, source)) throw new Error('不支持此计划文件格式')
  const bytes = await readFile(source)
  // XML parsers must never fetch external entities from user-supplied files.
  if (['.xml', '.pmxml'].includes(extname(source).toLowerCase()) && /<!DOCTYPE|<!ENTITY/i.test(xmlText(bytes))) {
    throw new Error('计划 XML 不允许包含外部实体或 DTD')
  }
  return { source, revision: createHash('sha256').update(bytes).digest('hex') }
}

export async function runProjectEngine(request, { runtimeDir = runtime, signal } = {}) {
  if (activeEngines >= 2) throw new Error('正在处理其他计划文件，请稍后重试')
  activeEngines++
  try { return await new Promise((resolveResult, reject) => {
    const java = join(runtimeDir, 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    const child = spawn(java, ['-Xmx512m', '-Djava.awt.headless=true', '-Dfile.encoding=UTF-8',
      '-Djavax.xml.accessExternalDTD=', '-Djavax.xml.accessExternalSchema=', '-Djavax.xml.accessExternalStylesheet=',
      '-cp', [join(runtimeDir, 'classes'), join(runtimeDir, 'lib', '*')].join(delimiter), 'ProjectPlan'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal,
    })
    let output = '', diagnostics = '', failure
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    const timer = setTimeout(() => { failure = new Error('计划文件解析超时，请检查文件或缩小计划范围'); child.kill() }, 120000)
    child.stdout.on('data', chunk => {
      output += chunk.toString('utf8')
      if (Buffer.byteLength(output) > MAX_BYTES) { failure = new Error('计划内容过大'); child.kill() }
    })
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString('utf8')).slice(-4000) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (failure || code !== 0) return reject(failure || new Error(`计划文件读取失败：${diagnostics || code}`))
      try { resolveResult(JSON.parse(output)) } catch { reject(new Error('计划文件引擎返回了无效数据')) }
    })
    child.stdin.on('error', () => {}) // The exit/error handler reports startup failure.
    child.stdin.end(JSON.stringify(request))
  }) } finally { activeEngines-- }
}

export async function readProjectPlan(cwd, path, options) {
  const source = await sourceInfo(cwd, path)
  const result = await runProjectEngine({ operation: 'read', source: source.source }, options)
  const after = await sourceInfo(cwd, path)
  if (after.revision !== source.revision) throw new Error('计划文件在读取时发生变化，请重新打开')
  return { ...result, path: source.source, revision: source.revision }
}

export async function exportProjectPlan(cwd, body, options) {
  const { path, revision, format, projectIndex, changes, filename } = body
  if (!Object.hasOwn(formats, format)) throw new Error('请选择 Project XML、P6 XML 或 P6 XER')
  if (!Number.isInteger(projectIndex) || projectIndex < 0 || !Array.isArray(changes) || changes.length > 20000) {
    throw new Error('无效的计划编辑请求')
  }
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 180 ||
      /[\\/:*?"<>|\x00-\x1f]/.test(filename) || filename === '.' || filename === '..' ||
      /[. ]$/.test(filename) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) {
    throw new Error('请输入有效的导出文件名，不要包含路径')
  }
  const source = await sourceInfo(cwd, path)
  if (source.revision !== revision) throw new Error('原计划已被其他程序修改，请重新打开后再编辑')
  const outputName = filename.toLowerCase().endsWith(formats[format]) ? filename : filename + formats[format]
  const destination = join(dirname(source.source), outputName)
  if (destination.toLowerCase() === source.source.toLowerCase()) throw new Error('请使用新的文件名，保留原始计划')
  const staging = await mkdtemp(join(dirname(source.source), '.agent-pi-plan-'))
  try {
    const output = join(staging, basename(outputName))
    const result = await runProjectEngine({ operation: 'export', source: source.source, output, format, projectIndex, changes }, options)
    if ((await sourceInfo(cwd, path)).revision !== revision) throw new Error('原计划在导出期间发生变化，请重新打开')
    // Exclusive copy refuses overwrite and is independent of case-insensitive name checks.
    await copyFile(output, destination, constants.COPYFILE_EXCL)
    return { ...result, path: destination, filename: outputName,
      warning: '已另存并重新读取验证。格式转换可能丢失原软件特有字段；未重新排程，请在 Project/P6 中复核日历、依赖、资源及基线。' }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
