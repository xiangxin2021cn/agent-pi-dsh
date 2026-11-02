import { tCodexExecution } from './locales/codex-execution.js'

export function codexExecutionErrorMessage(error, language) {
  const fallback = tCodexExecution('requestFailed', language)
  const raw = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : ''
  const message = raw.replace(/^Error:\s*/i, '')
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, '').replace(/^Error:\s*/i, '')
    .split(/\r?\n/)[0].trim()
    .replace(/(["']?(?:authorization|proxy-authorization)["']?\s*[:=]\s*["']?)(?:(?:Bearer|Basic)\s+)?[^"'\s,;}]+/gi, '$1[REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[REDACTED]')
    .replace(/((?:[?&]|\b)(?:[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|password)\s*["']?\s*[:=]\s*["']?)[^&\s,;"'}<>]+/gi, '$1[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
  if (!message || /^(?:Error|Unknown(?: error)?|undefined|null|\[object Object\])[.!]?$/i.test(message)) return fallback
  return message.length > 500 ? message.slice(0, 500) + '…' : message
}

export function createNativeCodexHistory({ React, desktop, language, useLanguage = language, renderMessage = (text) => text, openFile }) {
  const h = React.createElement
  const states = new Map()
  const listeners = new Map()
  const current = (id) => states.get(id) || { sessionId: id, messages: [] }
  const update = (state) => {
    if (!state?.sessionId) return
    states.set(state.sessionId, {
      sessionId: state.sessionId, cwd: state.cwd, messages: state.messages || [],
      error: state.error, errorCode: state.errorCode,
    })
    for (const listener of listeners.get(state.sessionId) || []) listener()
  }
  const load = async (id) => {
    const read = desktop?.codexHistoryStatus || desktop?.codexExecutionStatus
    if (!id || !read) return
    update({ ...(await read.call(desktop, id)), sessionId: id })
  }
  const subscribe = (id, listener) => {
    const set = listeners.get(id) || new Set()
    listeners.set(id, set)
    set.add(listener)
    return () => { set.delete(listener); if (!set.size) listeners.delete(id) }
  }
  function View(props) {
    const lang = useLanguage()
    const id = props.sessionId || ''
    const [, tick] = React.useState(0)
    React.useEffect(() => {
      const off = subscribe(id, () => tick((value) => value + 1))
      load(id).catch((error) => update({ ...current(id), sessionId: id, error: error.message }))
      return off
    }, [id])
    const state = current(id)
    const t = (key) => tCodexExecution(key, lang)
    const errorSummary = t(state.errorCode || 'requestFailed')
    const errorDetail = codexExecutionErrorMessage(state.error, lang)
    const message = (row) => {
      if (row.role === 'tool') return h('details', null, h('summary', null, row.text.split('\n')[0]), h('pre', { style: { whiteSpace: 'pre-wrap' } }, row.text))
      const links = /\[([^\]]+)\]\((<?(?:[A-Za-z]:[\\/]|\/)[^)\n]+)\)/g
      const parts = []
      let last = 0
      for (const match of row.text.matchAll(links)) {
        parts.push(renderMessage(row.text.slice(last, match.index), state.cwd))
        const path = match[2].replace(/^</, '').replace(/>$/, '')
        parts.push(h('button', { type: 'button', key: match.index, onClick: () => openFile ? openFile(state.cwd, path) : desktop.openPath(path) }, match[1]))
        last = match.index + match[0].length
      }
      parts.push(renderMessage(row.text.slice(last), state.cwd))
      return parts
    }
    return h('div', { 'data-agent-pi-codex-history': id, style: { height: '100%', overflow: 'auto', minWidth: 0 } },
      h('div', { style: { maxWidth: 900, margin: '0 auto', padding: 24 } },
        h('strong', null, lang === 'zh' ? 'Codex 历史（只读）' : 'Codex history (read-only)'),
        h('p', { style: { color: '#697586' } }, lang === 'zh' ? '保留原对话和成果；请回到对话页面，由 DSH 接续当前任务。' : 'Original messages and deliverables are preserved. Return to Chat to continue the task with DSH.'),
        !state.messages.length && h('p', null, lang === 'zh' ? '此会话没有 Codex 历史记录。' : 'No Codex history for this conversation.'),
        ...state.messages.map((row) => h('article', { key: row.id, style: { marginTop: 20, padding: 14, borderRadius: 10, background: row.role === 'user' ? '#eef3fa' : 'transparent', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: row.role === 'tool' ? 13 : 15 } },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, row.role === 'user' ? t('you') : row.role === 'assistant' ? 'Codex' : t('tool')),
          message(row),
        )),
        state.error && h('p', { role: 'alert', style: { color: '#b42318' } }, errorSummary,
          errorDetail !== errorSummary && errorDetail !== t('requestFailed') ? h('span', { style: { display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, errorDetail) : null),
      ),
    )
  }
  return { View, current, subscribe, load, dispose() { listeners.clear() } }
}
