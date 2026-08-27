/**
 * App-only knowledge transfer container (.apkb).
 * Ciphertext is AES-256-GCM with an application key. Zip/Office/text tools
 * cannot list or read the manuscript. This is app binding, not a user password.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'

export const KB_TRANSFER_EXT = '.apkb'
export const KB_TRANSFER_KIND = 'agent-pi-kb-transfer'
export const KB_TRANSFER_MIME = 'application/vnd.agent-pi.kb-transfer'
export const KB_TRANSFER_MAX_BYTES = 80 * 1024 * 1024
export const KB_TRANSFER_MAX_ORIGINAL = 32 * 1024 * 1024

const MAGIC = Buffer.from('APKB')
const VERSION = 1
const IV_LEN = 12
const TAG_LEN = 16
const HEADER_LEN = MAGIC.length + 1 + IV_LEN + TAG_LEN

const SEAL_KEY = createHash('sha256')
  .update('agent-pi-dsh')
  .update(Buffer.from([0x3a, 0x70, 0x69, 0x2d, 0x6b, 0x62, 0x01]))
  .update('transfer-seal')
  .digest()

const AAD = Buffer.concat([MAGIC, Buffer.from([VERSION])])

export interface KbTransferEntryItem {
  type: 'entry'
  slug: string
  name: string
  category: string
  folderName?: string
  originalName?: string
  ingest?: 'direct' | 'mineru' | 'pack'
  manuscript: string
  contentList?: unknown
  originalBase64?: string
}

export interface KbTransferSkillItem {
  type: 'skill'
  slug: string
  markdown: string
}

export type KbTransferItem = KbTransferEntryItem | KbTransferSkillItem

export interface KbTransferPayload {
  kind: typeof KB_TRANSFER_KIND
  schemaVersion: 1
  exportedAt: string
  items: KbTransferItem[]
}

function sealKey(): Buffer {
  return SEAL_KEY
}

export function looksLikeKbTransferName(name?: string): boolean {
  return /\.apkb$/i.test(String(name || ''))
}

export function looksLikeKbTransfer(bytes: Buffer): boolean {
  return Buffer.isBuffer(bytes) && bytes.length >= MAGIC.length && bytes.subarray(0, MAGIC.length).equals(MAGIC)
}

export function looksLikeKbTransferPath(path: string): boolean {
  if (!path || !existsSync(path)) return false
  try {
    if (!statSync(path).isFile()) return false
    const head = readFileSync(path).subarray(0, MAGIC.length)
    return head.equals(MAGIC)
  } catch {
    return false
  }
}

export function sealKbTransfer(payload: KbTransferPayload): Buffer {
  if (payload.kind !== KB_TRANSFER_KIND || payload.schemaVersion !== 1) {
    throw new Error('传递包内容不是本应用格式')
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('传递包是空的')
  }
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv, { authTagLength: TAG_LEN })
  cipher.setAAD(AAD)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  const out = Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, tag, encrypted])
  if (out.length > KB_TRANSFER_MAX_BYTES) {
    throw new Error(`传递包超过 ${Math.round(KB_TRANSFER_MAX_BYTES / 1024 / 1024)}MB，请分条导出`)
  }
  return out
}

export function openKbTransfer(bytes: Buffer): KbTransferPayload {
  if (!Buffer.isBuffer(bytes) || bytes.length < HEADER_LEN) {
    throw new Error('不是 Agent Pi 传递包')
  }
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('不是 Agent Pi 传递包（其他工具打不开，请用本应用导入）')
  }
  if (bytes[MAGIC.length] !== VERSION) {
    throw new Error(`传递包版本不受支持：${bytes[MAGIC.length]}`)
  }
  if (bytes.length > KB_TRANSFER_MAX_BYTES) {
    throw new Error('传递包过大')
  }
  const iv = bytes.subarray(MAGIC.length + 1, MAGIC.length + 1 + IV_LEN)
  const tag = bytes.subarray(MAGIC.length + 1 + IV_LEN, HEADER_LEN)
  const encrypted = bytes.subarray(HEADER_LEN)
  const decipher = createDecipheriv('aes-256-gcm', sealKey(), iv, { authTagLength: TAG_LEN })
  decipher.setAAD(AAD)
  decipher.setAuthTag(tag)
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(encrypted), decipher.final()])
  } catch {
    throw new Error('传递包无法打开。请确认文件完整，并用 Agent Pi DSH 导入。')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(plain.toString('utf8'))
  } catch {
    throw new Error('传递包内容损坏')
  }
  const payload = parsed as Partial<KbTransferPayload>
  if (payload.kind !== KB_TRANSFER_KIND || payload.schemaVersion !== 1 || !Array.isArray(payload.items)) {
    throw new Error('传递包不是本应用格式')
  }
  if (payload.items.length === 0) throw new Error('传递包是空的')
  return {
    kind: KB_TRANSFER_KIND,
    schemaVersion: 1,
    exportedAt: String(payload.exportedAt || ''),
    items: payload.items,
  }
}

export function transferFileName(label: string): string {
  const stem = String(label || 'knowledge')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)
  return `${stem || 'knowledge'}${KB_TRANSFER_EXT}`
}
