/**
 * MinerU cloud extract (https://mineru.net/apiManage/docs).
 * Token lives under the KB root so it survives upgrades and never ships in git.
 */
import { inflateRawSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { readJson } from './fsutil.ts'

function kbRoot(): string {
  const explicit = process.env.AGENT_PI_KB_ROOT
  if (explicit) return resolve(explicit)
  const dshHome = process.env.DSH_HOME
  if (dshHome) return resolve(dshHome, 'knowledge-base')
  return resolve(homedir(), '.agent-pi', 'knowledge-base')
}

const MINERU_ORIGIN = 'https://mineru.net'
const LIGHT_MAX_BYTES = 10 * 1024 * 1024
const POLL_MS = 3000
const POLL_TIMEOUT_MS = 15 * 60 * 1000

export const MINERU_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp',
])

interface MineruStore {
  token?: string
}

function storePath(): string {
  return join(kbRoot(), 'mineru.json')
}

function readStore(): MineruStore {
  return readJson<MineruStore>(storePath(), {})
}

function normalizeMineruToken(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^authorization:\s*/i, '')
    .replace(/^bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .trim()
}

function readToken(): string {
  const fromEnv = normalizeMineruToken(process.env.MINERU_TOKEN || process.env.MINERU_API_KEY || '')
  if (fromEnv) return fromEnv
  return normalizeMineruToken(readStore().token || '')
}

export function mineruStatus(): { configured: boolean; hint: string } {
  const token = readToken()
  if (!token) return { configured: false, hint: '' }
  const tail = token.length <= 4 ? '已保存' : `已保存（…${token.slice(-4)}）`
  return { configured: true, hint: tail }
}

export function saveMineruToken(token: string): { configured: boolean; hint: string } {
  const next = normalizeMineruToken(token)
  if (!next) throw new Error('请填写 MinerU Token')
  mkdirSync(kbRoot(), { recursive: true })
  writeFileSync(storePath(), `${JSON.stringify({ token: next }, null, 2)}\n`, 'utf8')
  return mineruStatus()
}

export function clearMineruToken(): { configured: boolean; hint: string } {
  if (existsSync(storePath())) writeFileSync(storePath(), `${JSON.stringify({}, null, 2)}\n`, 'utf8')
  return mineruStatus()
}

const AUTH_FAIL = new Set(['A0202', 'A0211'])

/** Probe Token against MinerU without submitting a parse job. */
export async function probeMineruToken(raw?: string): Promise<{
  ok: boolean
  configured: boolean
  hint: string
  message: string
}> {
  const draft = normalizeMineruToken(raw || '')
  const token = draft || readToken()
  const saved = mineruStatus()
  if (!token) {
    return { ok: false, configured: saved.configured, hint: saved.hint, message: '请先填写或保存 MinerU Token' }
  }
  try {
    const res = await fetch(`${MINERU_ORIGIN}/api/v4/extract-results/batch/agent-pi-token-probe`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    const json = asRecord(await res.json().catch(() => ({})))
    const code = String(json.code ?? '')
    if (AUTH_FAIL.has(code) || res.status === 401 || res.status === 403) {
      return {
        ok: false,
        configured: saved.configured,
        hint: saved.hint,
        message: code === 'A0211' ? 'Token 已过期，请到 mineru.net 更换后再保存' : 'Token 无效。请确认完整粘贴，不要带多余空格。',
      }
    }
    return {
      ok: true,
      configured: saved.configured,
      hint: saved.hint,
      message: saved.configured ? 'Token 有效，可以解析超过 10MB 的文件' : 'Token 有效。请再点「保存 Token」写到本机。',
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      configured: saved.configured,
      hint: saved.hint,
      message: /fetch|network|ENOTFOUND|ECONN|timed out/i.test(msg)
        ? '连不上 MinerU，请检查网络后重试'
        : '验证失败，请稍后重试',
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function mineruJson(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${MINERU_ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = asRecord(await res.json().catch(() => ({})))
  if (!res.ok || Number(json.code ?? 0) !== 0) {
    const msg = String(json.msg || json.message || res.statusText || 'MinerU 请求失败')
    throw new Error(msg)
  }
  return asRecord(json.data)
}

async function putFile(url: string, bytes: Buffer): Promise<void> {
  const res = await fetch(url, { method: 'PUT', body: new Uint8Array(bytes) })
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`MinerU 上传失败 HTTP ${res.status}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface MineruExtractResult {
  markdown: string
  via: 'precision' | 'lightweight'
  contentList?: unknown
}

function parseJsonBuffer(raw: Buffer): unknown | undefined {
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    return undefined
  }
}

function extractZipArtifacts(buf: Buffer): MineruExtractResult {
  let offset = 0
  let markdown: Buffer | null = null
  let fallback: Buffer | null = null
  let contentList: unknown | undefined
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break
    const method = buf.readUInt16LE(offset + 8)
    const compSize = buf.readUInt32LE(offset + 18)
    const nameLen = buf.readUInt16LE(offset + 26)
    const extraLen = buf.readUInt16LE(offset + 28)
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8').replace(/\\/g, '/')
    const dataStart = offset + 30 + nameLen + extraLen
    const data = buf.subarray(dataStart, dataStart + compSize)
    offset = dataStart + compSize
    if (name.includes('__MACOSX') || name.endsWith('/')) continue
    let raw: Buffer
    if (method === 0) raw = Buffer.from(data)
    else if (method === 8) raw = inflateRawSync(data)
    else continue
    const base = name.split('/').pop()?.toLowerCase() || ''
    if (base === 'full.md') markdown = raw
    else if (!fallback && base.endsWith('.md')) fallback = raw
    else if (!contentList && (base === 'content_list.json' || base.endsWith('_content_list.json'))) {
      contentList = parseJsonBuffer(raw)
    }
  }
  const md = markdown || fallback
  if (!md) throw new Error('MinerU 结果包里没有 Markdown')
  return { markdown: md.toString('utf8'), via: 'precision', contentList }
}

async function extractPrecision(filePath: string, token: string, isOcr: boolean): Promise<MineruExtractResult> {
  const name = basename(filePath)
  const created = await mineruJson('POST', '/api/v4/file-urls/batch', {
    files: [{ name, is_ocr: isOcr }],
    model_version: 'vlm',
    enable_table: true,
    enable_formula: true,
    language: 'ch',
  }, token)
  const batchId = String(created.batch_id || '')
  const urls = Array.isArray(created.file_urls) ? created.file_urls.map(String) : []
  if (!batchId || !urls[0]) throw new Error('MinerU 未返回上传地址')
  await putFile(urls[0], readFileSync(filePath))
  const started = Date.now()
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const data = await mineruJson('GET', `/api/v4/extract-results/batch/${batchId}`, undefined, token)
    const rows = Array.isArray(data.extract_result) ? data.extract_result : []
    const row = asRecord(rows[0])
    const state = String(row.state || '')
    if (state === 'done') {
      const zipUrl = String(row.full_zip_url || '')
      if (!zipUrl) throw new Error('MinerU 完成但没有结果包')
      const zipRes = await fetch(zipUrl)
      if (!zipRes.ok) throw new Error(`下载 MinerU 结果失败 HTTP ${zipRes.status}`)
      return extractZipArtifacts(Buffer.from(await zipRes.arrayBuffer()))
    }
    if (state === 'failed') throw new Error(String(row.err_msg || 'MinerU 解析失败'))
    await sleep(POLL_MS)
  }
  throw new Error('MinerU 解析超时，请稍后在知识库重试')
}

async function extractLightweight(filePath: string, isOcr: boolean): Promise<MineruExtractResult> {
  const created = await mineruJson('POST', '/api/v1/agent/parse/file', {
    file_name: basename(filePath),
    language: 'ch',
    enable_table: true,
    enable_formula: true,
    is_ocr: isOcr,
  })
  const taskId = String(created.task_id || '')
  const fileUrl = String(created.file_url || '')
  if (!taskId || !fileUrl) throw new Error('MinerU 轻量接口未返回上传地址')
  await putFile(fileUrl, readFileSync(filePath))
  const started = Date.now()
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const data = await mineruJson('GET', `/api/v1/agent/parse/${taskId}`)
    const state = String(data.state || '')
    if (state === 'done') {
      const markdownUrl = String(data.markdown_url || '')
      if (!markdownUrl) throw new Error('MinerU 完成但没有 Markdown 链接')
      const mdRes = await fetch(markdownUrl)
      if (!mdRes.ok) throw new Error(`下载解析稿失败 HTTP ${mdRes.status}`)
      return { markdown: await mdRes.text(), via: 'lightweight' }
    }
    if (state === 'failed') throw new Error(String(data.err_msg || 'MinerU 解析失败'))
    await sleep(POLL_MS)
  }
  throw new Error('MinerU 解析超时，请稍后在知识库重试')
}

/** Convert one local office/PDF/image file to Markdown. Default OCR on. */
export async function extractDocumentToMarkdown(
  filePath: string,
  options?: { isOcr?: boolean },
): Promise<MineruExtractResult> {
  const isOcr = options?.isOcr !== false
  const token = readToken()
  const size = statSync(filePath).size
  if (token) {
    return extractPrecision(filePath, token, isOcr)
  }
  if (size > LIGHT_MAX_BYTES) {
    throw new Error('文件超过 10MB。请在知识库页填写 MinerU Token：https://mineru.net/apiManage/token')
  }
  return extractLightweight(filePath, isOcr)
}
