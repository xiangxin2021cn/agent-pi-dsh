import { constants as fsConstants, copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { createDepthStore } from '../bundles/tender-host/src/professional-depth-store.mjs'

const EVENT = 'agent-pi/professional-depth'

export function decompressSessionFrames(bytes) {
  const chunks = []
  let offset = 0
  while (offset < bytes.length) {
    const { buffer, engine } = zstdDecompressSync(bytes.subarray(offset), { info: true })
    if (!engine.bytesWritten) throw new Error('无法读取完整 Zstandard 日志帧')
    chunks.push(buffer)
    offset += engine.bytesWritten
  }
  return Buffer.concat(chunks)
}

// Run before the DSH host starts. Preserve every event and sequence number;
// this product-only preference never contributed to the model history.
export function repairProfessionalDepthSessions(home) {
  const result = { scanned: 0, repaired: 0, errors: [] }
  const root = join(home, 'sessions')
  if (!existsSync(root)) return result
  const store = createDepthStore(home)
  const directories = [root]
  while (directories.length) {
    for (const entry of readdirSync(directories.pop(), { withFileTypes: true })) {
      const path = join(entry.parentPath, entry.name)
      if (entry.isDirectory()) { directories.push(path); continue }
      if (!entry.isFile() || !/^session(?:\.v3)?\.jsonl(?:\.zstd)?$/.test(entry.name)) continue
      result.scanned++
      try {
        const original = readFileSync(path)
        const compressed = path.endsWith('.zstd')
        const text = (compressed ? decompressSessionFrames(original) : original).toString('utf8')
        if (!text.includes(EVENT)) continue
        if (!text.endsWith('\n')) throw new Error('日志尾部未完成，保留原文件等待恢复')
        const lines = text.slice(0, -1).split('\n')
        const header = JSON.parse(lines[0])
        const sessionId = header.id ?? header.header?.id
        let state
        let changed = false
        for (let index = 1; index < lines.length; index++) {
          const event = JSON.parse(lines[index])
          if (event.type !== EVENT) continue
          if (event.data?.sessionId === sessionId) state = event.data
          if (event.ignorable === true) continue
          event.ignorable = true
          lines[index] = JSON.stringify(event)
          changed = true
        }
        if (!changed) continue
        const backup = `${path}.agent-pi-depth-original`
        if (!existsSync(backup)) copyFileSync(path, backup, fsConstants.COPYFILE_EXCL)
        if (state && !store.read(sessionId)) store.importLegacy(state)
        // Keep the header in its own Zstd frame, as required by native readers.
        const encode = (line) => zstdCompressSync(`${line}\n`, { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
        const replacement = compressed ? Buffer.concat(lines.map(encode)) : Buffer.from(`${lines.join('\n')}\n`)
        const temp = `${path}.agent-pi-depth-writing`
        writeFileSync(temp, replacement, { mode: 0o600 })
        if (!readFileSync(path).equals(original)) throw new Error('日志在修复期间发生变化，已保留原文件')
        renameSync(temp, path)
        result.repaired++
      } catch (error) {
        result.errors.push({ file: path, error: String(error.message || error) })
      }
    }
  }
  return result
}
