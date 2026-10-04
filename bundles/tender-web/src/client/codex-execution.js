import { tCodexExecution } from './locales/codex-execution.js'

export function createNativeCodexExecution({ React, desktop, language, useLanguage = language, notify = () => {}, renderMessage = (text) => text, openFile }) {
  const h = React.createElement
  const states = new Map()
  const listeners = new Map()
  const engines = new Map()
  let unsubscribe = null
  const current = (id) => states.get(id) || { sessionId: id, phase: 'idle', messages: [], requests: [] }
  const update = (state) => {
    if (!state?.sessionId) return
    states.set(state.sessionId, state)
    for (const listener of listeners.get(state.sessionId) || []) listener()
    notify()
  }
  const connect = () => { unsubscribe ??= desktop?.onCodexExecution?.(update) || null }
  const load = async (id) => {
    if (!id || !desktop?.codexExecutionStatus) return
    connect()
    update({ ...(await desktop.codexExecutionStatus(id)), sessionId: id })
  }
  const subscribe = (id, listener) => {
    connect()
    const set = listeners.get(id) || new Set()
    listeners.set(id, set)
    set.add(listener)
    return () => { set.delete(listener); if (!set.size) listeners.delete(id) }
  }
  const busy = (id) => ['starting', 'running', 'waiting'].includes(current(id).phase)
  const enabled = (id) => {
    if (!engines.has(id)) {
      let value = false
      try { value = localStorage.getItem(`agent-pi:main-engine:${id}`) === 'codex' } catch {}
      engines.set(id, value)
    }
    return engines.get(id) === true
  }
  const setEnabled = (id, value) => {
    if (busy(id)) throw new Error(tCodexExecution('switchBlocked', language()))
    engines.set(id, value === true)
    try { localStorage.setItem(`agent-pi:main-engine:${id}`, value ? 'codex' : 'dsh') } catch {}
    notify()
  }
  async function submit(input) {
    if (!desktop?.codexExecutionSubmit) throw new Error(tCodexExecution('desktopRequired', language()))
    connect()
    return update(await desktop.codexExecutionSubmit(input))
  }
  function Question({ request, identity }) {
    const lang = useLanguage()
    const [answers, setAnswers] = React.useState({})
    const [error, setError] = React.useState('')
    const t = (key) => tCodexExecution(key, lang)
    const send = async (answer) => {
      try { update(await desktop.codexExecutionReply(identity, request.id, answer)) } catch { setError(t('replyFailed')) }
    }
    const questions = request.params.questions || []
    return h('section', { style: { border: '1px solid #ccd4df', borderRadius: 10, padding: 16, margin: '12px 0' } },
      h('strong', null, t(questions.length ? 'answerNeeded' : 'approvalNeeded')),
      questions.length ? questions.map((question) => h('label', { key: question.id, style: { display: 'block', marginTop: 10 } },
        h('div', null, question.question),
        question.options?.length ? h('select', { value: answers[question.id] || '', onChange: (event) => setAnswers({ ...answers, [question.id]: event.target.value }) },
          h('option', { value: '' }, t('choose')),
          ...question.options.map((option) => h('option', { key: option.label, value: option.label }, option.label + (option.description ? ' — ' + option.description : ''))),
          question.isOther && h('option', { value: '__other__' }, t('other'))) : null,
        (!question.options?.length || answers[question.id] === '__other__') && h('input', { type: question.isSecret ? 'password' : 'text', value: answers[question.id + ':other'] || '', onChange: (event) => setAnswers({ ...answers, [question.id + ':other']: event.target.value }), style: { width: '100%', marginTop: 6 } }),
      )) : h('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, JSON.stringify({ reason: request.params.reason, command: request.params.command, changes: request.params.changes, permissions: request.params.permissions, additionalPermissions: request.params.additionalPermissions, networkApprovalContext: request.params.networkApprovalContext, grantRoot: request.params.grantRoot, cwd: request.params.cwd }, null, 2)),
      error && h('p', { role: 'alert' }, error),
      questions.length ? h('button', { type: 'button', onClick: () => send(Object.fromEntries(questions.map((question) => [question.id, !question.options?.length || answers[question.id] === '__other__' ? answers[question.id + ':other'] : answers[question.id]]))) }, t('reply'))
        : h('div', null, h('button', { type: 'button', onClick: () => send('accept') }, t('approve')), ' ', h('button', { type: 'button', onClick: () => send('decline') }, t('decline'))),
    )
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
    const identity = { sessionId: id, cwd: state.cwd }
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
    return h('div', { 'data-agent-pi-codex-main': id, style: { height: '100%', overflow: 'auto', minWidth: 0 } },
      h('div', { style: { maxWidth: 900, margin: '0 auto', padding: 24 } },
        h('strong', null, t('main')),
        h('span', { style: { marginLeft: 12, color: '#697586' } }, t(state.phase === 'idle' ? 'ready' : state.phase)),
        busy(id) && h('button', { type: 'button', style: { marginLeft: 12 }, onClick: () => desktop.codexExecutionInterrupt(identity).then(update).catch((error) => update({ ...state, error: error.message })) }, t('stop')),
        !state.messages.length && h('p', null, t('intro')),
        ...state.messages.map((row) => h('article', { key: row.id, style: { marginTop: 20, padding: 14, borderRadius: 10, background: row.role === 'user' ? '#eef3fa' : 'transparent', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: row.role === 'tool' ? 13 : 15 } },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, row.role === 'user' ? t('you') : row.role === 'assistant' ? 'Codex' : t('tool')),
          message(row),
        )),
        state.error && h('p', { role: 'alert', style: { color: '#b42318' } }, t(state.errorCode || 'requestFailed')),
        ...state.requests.map((request) => h(Question, { key: request.id, request, identity })),
      ),
    )
  }
  return { View, current, subscribe, load, enabled, setEnabled, busy, submit, dispose() { unsubscribe?.(); unsubscribe = null; listeners.clear() } }
}
