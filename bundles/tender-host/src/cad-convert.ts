import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertInside } from './files.ts'

const execFileAsync = promisify(execFile)

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

async function runMlightcad(source: string, output: string): Promise<void> {
  try {
    await execFileAsync(process.execPath, [fileURLToPath(new URL('./cad-convert-worker.mjs', import.meta.url)), source, output], {
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
  } catch (error) {
    const cause = error as NodeJS.ErrnoException & { stderr?: string }
    throw new Error(`MLightCAD DWG 转 DXF 失败：${String(cause.stderr || cause.message).trim()}`)
  }
}

export async function convertDwgToDxf(
  cwd: string,
  sourcePath: string,
  runConverter: (source: string, output: string) => Promise<void> = runMlightcad,
): Promise<{ path: string; relativePath: string; sourceHash: string; cached: boolean }> {
  const source = assertInside(cwd, isAbsolute(sourcePath) ? sourcePath : resolve(cwd, sourcePath))
  if (extname(source).toLowerCase() !== '.dwg') throw new Error('只接受 DWG 文件；DXF 可直接供读图工具使用。')
  if (!statSync(source).isFile()) throw new Error('DWG 路径不是文件。')
  const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex')
  const dir = assertInside(cwd, join(cwd, '.agent-pi', 'cad-converted'))
  const name = basename(source, extname(source)) + '-' + sourceHash.slice(0, 12) + '.dxf'
  const path = assertInside(cwd, join(dir, name))
  const relativePath = relative(resolve(cwd), path)
  if (existsSync(path) && validAsciiDxf(path)) return { path, relativePath, sourceHash, cached: true }
  mkdirSync(dir, { recursive: true })
  const temporary = join(dir, `${name}.${randomUUID()}.tmp`)
  try {
    await runConverter(source, temporary)
    if (!existsSync(temporary) || !validAsciiDxf(temporary)) throw new Error('转换器未生成完整的 ASCII DXF（缺少 SECTION 或 EOF）。')
    renameSync(temporary, path)
    return { path, relativePath, sourceHash, cached: false }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}
