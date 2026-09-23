/** Task status only; native Chat settings own work-details presentation. */
export const taskProcessCss = `
.ap-task-process{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary,#687280);max-width:520px}.ap-task-process span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

export function taskProcessSummary(snapshot, fallbackLanguage = 'zh') {
  const nodes = snapshot?.chat?.legacy?.nodes || []
  const lastUser = [...nodes].reverse().find((node) => (node.kind === 'user' || node.kind === 'steering') && node.source?.kind === 'user')
  const text = (lastUser?.content || []).filter((part) => part.type === 'text').map((part) => part.text).join(' ')
  const language = /[\u3400-\u9fff]/u.test(text) ? 'zh' : /[a-zA-Z]/.test(text) ? 'en' : fallbackLanguage
  if (!snapshot?.running) return { language, text: '' }
  const name = snapshot?.chat?.legacy?.runningCalls?.at(-1)?.name || ''
  const labels = language === 'zh'
    ? { read: '正在阅读任务资料', search: '正在查找相关依据', write: '正在整理交付成果', review: '正在核对交付要求', work: '正在处理本次任务' }
    : { read: 'Reading task materials', search: 'Finding relevant evidence', write: 'Preparing deliverables', review: 'Checking delivery requirements', work: 'Working on this task' }
  const kind = /^(read|read_image|web_fetch)$/.test(name) ? 'read'
    : /^(web_search|grep|glob|kb_search)$/.test(name) ? 'search'
      : /^(write|edit|univer_)/.test(name) ? 'write'
        : /^(professional_depth|present)$/.test(name) ? 'review' : 'work'
  return { language, text: labels[kind] }
}

export function createTaskProcess({ React, snapshot, subscribe, language }) {
  const h = React.createElement
  return function TaskProcess({ sessionId }) {
    const [, refresh] = React.useState(0)
    React.useEffect(() => {
      let timer
      const stop = subscribe(sessionId, () => {
        if (timer) return
        timer = setTimeout(() => { timer = null; refresh((n) => n + 1) }, 200)
      })
      return () => { clearTimeout(timer); stop?.() }
    }, [sessionId])
    const summary = taskProcessSummary(snapshot(sessionId), language())
    if (!summary.text) return null
    return h('div', { className: 'ap-task-process' },
      h('span', { role: 'status', 'aria-live': 'polite' }, summary.text),
    )
  }
}
