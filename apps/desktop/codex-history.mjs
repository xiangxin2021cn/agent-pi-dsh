import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, win32 } from 'node:path'

/** Read the retired desktop executor's messages without starting a CLI or changing its state. */
export function readCodexHistory(stateFile, sessionId) {
  if (typeof sessionId !== 'string' || !/^[\w-]{1,160}$/.test(sessionId)) throw new Error('历史记录需要原会话编号。')
  const empty = { sessionId, messages: [] }
  try {
    if (statSync(stateFile).size > 64 * 1024 * 1024) throw new Error('History size limit')
    const stored = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (!Array.isArray(stored?.sessions)) throw new Error('Invalid history')
    const matches = stored.sessions.filter(row => row?.sessionId === sessionId)
    if (!matches.length) return empty
    if (matches.length !== 1) throw new Error('Ambiguous history')
    const record = matches[0]
    if (typeof record.cwd !== 'string' || !(isAbsolute(record.cwd) || win32.isAbsolute(record.cwd)) || !Array.isArray(record.messages)) throw new Error('Invalid history')
    const messages = record.messages.map(row => {
      if (typeof row?.id !== 'string' || !['user', 'assistant', 'tool'].includes(row.role) || typeof row.text !== 'string') throw new Error('Invalid history message')
      return { id: row.id, role: row.role, text: row.text }
    })
    return { sessionId, cwd: record.cwd, messages }
  } catch (error) {
    if (error.code === 'ENOENT') return empty
    return { ...empty, error: '旧 Codex 历史暂不能完整读取；原文件已保留，请核对原记录。' }
  }
}
