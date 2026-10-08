import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertInside } from './files.ts'

const execFileAsync = promisify(execFile)
type ConversionDetails = { warnings: number[]; engine?: string; engineVersion?: string; bundledModelQuality?: any }
async function fileHash(path: string) {
  const digest = createHash('sha256')
  for await (const bytes of createReadStream(path)) digest.update(bytes)
  return digest.digest('hex')
}

function validAsciiDxf(path: string): boolean {
  const size = statSync(path).size
  if (size < 100) return false
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(Math.min(size, 2048))
    const tail = Buffer.alloc(Math.min(size, 2048))
    readSync(fd, head, 0, head.length, 0)
    readSync(fd, tail, 0, tail.length, size - tail.length)
    return head.toString('ascii').includes('SECTION') && tail.toString('ascii').includes('EOF')
  } finally {
    closeSync(fd)
  }
}

async function runMlightcad(source: string, output: string): Promise<ConversionDetails> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [fileURLToPath(new URL('./cad-convert-worker.mjs', import.meta.url)), source, output], {
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    const warnings = [...new Set([...`${stdout}\n${stderr}`.matchAll(/Open dwg file with error code:\s*(\d+)/g)].map(match => Number(match[1])))]
    const line = stdout.split(/\r?\n/).find(line => line.startsWith('CAD_DWG_MODEL_QUALITY '))
    if (!line) throw new Error('DWG 转换器未返回块与图层关系校核。')
    const bundledModelQuality = JSON.parse(line.slice('CAD_DWG_MODEL_QUALITY '.length))
    return { warnings, bundledModelQuality, engine: 'mlightcad', engineVersion: JSON.parse(readFileSync(new URL('../lib/cad-decoder/CAD-HOST-CLEAN-BUILD.json', import.meta.url), 'utf8')).decoderVersion }
  } catch (error) {
    const cause = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    throw new Error(`MLightCAD DWG 转 DXF 失败：${[cause.stdout, cause.stderr, cause.message].filter(Boolean).join('\n').trim()}`)
  }
}

async function cachedDetails(path: string, source: string, sourceHash: string, outputBytes: number, outputHash: string, signature: string): Promise<ConversionDetails | undefined> {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'))
    if (record.schema === 'cad-dxf-verified/v2' && record.signature === signature && record.sourcePath === source && record.sourceHash === sourceHash && record.outputBytes === outputBytes && record.outputHash === outputHash && Array.isArray(record.warnings)
        && record.warnings.every((code: unknown) => typeof code === 'number' && Number.isSafeInteger(code) && code >= 0)) {
      if (record.engine === 'mlightcad' && record.bundledModelQuality?.valid !== true) return
      return { warnings: record.warnings, engine: record.engine, engineVersion: record.engineVersion, bundledModelQuality: record.bundledModelQuality }
    }
  } catch { /* A missing or invalid receipt cannot prove a previous conversion's warnings. */ }
}

export async function convertDwgToDxf(
  cwd: string,
  sourcePath: string,
  runConverter: (source: string, output: string) => Promise<void | ConversionDetails> = runMlightcad,
): Promise<{ path: string; relativePath: string; sourceHash: string; cached: boolean } & ConversionDetails> {
  const source = assertInside(cwd, isAbsolute(sourcePath) ? sourcePath : resolve(cwd, sourcePath))
  if (extname(source).toLowerCase() !== '.dwg') throw new Error('只接受 DWG 文件；DXF 可直接供读图工具使用。')
  if (!statSync(source).isFile()) throw new Error('DWG 路径不是文件。')
  const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex')
  const dir = assertInside(cwd, join(cwd, '.agent-pi', 'cad-converted'))
  const name = basename(source, extname(source)) + '-' + sourceHash.slice(0, 12) + '.dxf'
  const path = assertInside(cwd, join(dir, name))
  const receiptPath = path + '.conversion.json'
  const relativePath = relative(resolve(cwd), path)
  const fingerprint = createHash('sha256')
  for (const file of ['../package.json', './cad-convert.ts', './cad-convert-worker.mjs', './cad-dxf-output.mjs', './cad-dwg-model-quality.mjs', '../lib/cad-decoder/CAD-HOST-CLEAN-BUILD.json', '../lib/cad-decoder/libredwg-web.mjs', '../lib/cad-decoder/libredwg-wasm-factory.mjs', '../lib/cad-decoder/libredwg-web.wasm']) fingerprint.update(readFileSync(new URL(file, import.meta.url)))
  const signature = fingerprint.digest('hex')
  const prior = existsSync(path) && validAsciiDxf(path) ? await cachedDetails(receiptPath, source, sourceHash, statSync(path).size, await fileHash(path), signature) : undefined
  if (prior) {
    if (await fileHash(source) !== sourceHash) throw new Error('读取转换缓存期间 DWG 来源版本发生变化，未使用旧版本结果。')
    return { path, relativePath, sourceHash, cached: true, ...prior }
  }
  mkdirSync(dir, { recursive: true })
  const temporary = join(dir, `${name}.${randomUUID()}.tmp`)
  try {
    const result = await runConverter(source, temporary)
    const details: ConversionDetails = result || { warnings: [] }
    if (!existsSync(temporary) || !validAsciiDxf(temporary)) throw new Error('转换器未生成完整的 ASCII DXF（缺少 SECTION 或 EOF）。')
    if (details.engine === 'mlightcad' && details.bundledModelQuality?.valid !== true) throw new Error('DWG 上游几何关系校核未通过，未缓存错误块名或图层。')
    const outputBytes = statSync(temporary).size, outputHash = await fileHash(temporary)
    if (await fileHash(source) !== sourceHash) throw new Error('转换期间 DWG 来源版本发生变化，未缓存混合版本。')
    writeFileSync(temporary + '.json', JSON.stringify({ schema: 'cad-dxf-verified/v2', signature, sourcePath: source, sourceHash, outputBytes, outputHash, ...details }))
    renameSync(temporary, path)
    renameSync(temporary + '.json', receiptPath)
    return { path, relativePath, sourceHash, cached: false, ...details }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
    if (existsSync(temporary + '.json')) unlinkSync(temporary + '.json')
  }
}
