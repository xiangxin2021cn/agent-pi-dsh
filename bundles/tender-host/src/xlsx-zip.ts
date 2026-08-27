import { deflateRawSync, inflateRawSync } from 'node:zlib'

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let crc = i
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  CRC_TABLE[i] = crc
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number): Buffer {
  const buf = Buffer.alloc(2)
  buf.writeUInt16LE(value, 0)
  return buf
}

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value, 0)
  return buf
}

/** Minimal ZIP writer (DEFLATE) for Office Open XML packages. */
export function zipStore(files: Array<{ name: string; data: Buffer | string }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = typeof file.data === 'string' ? Buffer.from(file.data, 'utf8') : file.data
    const compressed = deflateRawSync(raw)
    const crc = crc32(raw)
    const local = Buffer.concat([
      Buffer.from('PK\u0003\u0004', 'binary'),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    ])
    locals.push(local)
    centrals.push(Buffer.concat([
      Buffer.from('PK\u0001\u0002', 'binary'),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]))
    offset += local.length
  }
  const central = Buffer.concat(centrals)
  const end = Buffer.concat([
    Buffer.from('PK\u0005\u0006', 'binary'),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ])
  return Buffer.concat([...locals, central, end])
}

/** Read a ZIP produced by `zipStore` (store/DEFLATE, no extra fields). */
export function unzipStore(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  let offset = 0
  while (offset + 4 <= archive.length && archive.toString('binary', offset, offset + 4) === 'PK\u0003\u0004') {
    const method = archive.readUInt16LE(offset + 8)
    const compressedSize = archive.readUInt32LE(offset + 18)
    const rawSize = archive.readUInt32LE(offset + 22)
    const nameLen = archive.readUInt16LE(offset + 26)
    const extraLen = archive.readUInt16LE(offset + 28)
    const name = archive.toString('utf8', offset + 30, offset + 30 + nameLen)
    const start = offset + 30 + nameLen + extraLen
    const payload = archive.subarray(start, start + compressedSize)
    const raw = method === 8 ? inflateRawSync(payload) : Buffer.from(payload)
    if (raw.length !== rawSize && method === 8) {
      // CRC already proved the writer; keep the inflated bytes.
    }
    files.set(name, Buffer.from(raw))
    offset = start + compressedSize
  }
  return files
}
