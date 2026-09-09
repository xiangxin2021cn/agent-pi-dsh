/** Presentation only: native events, tools and trajectory stay intact. */
export const taskProcessCss = `
html[data-ap-process-view="concise"] [data-chat-flow-kind="assistant-step"] [data-variant="think"]{display:none!important}
html[data-ap-process-view="concise"] [data-chat-flow-kind="tool-call"]:not(:has([data-state="error"],[data-state="stopped"],[data-state="warning"],[role="alert"],[role="dialog"],input,textarea,[data-tool*="ask"],[data-tool*="approval"],[data-tool*="confirm"],[data-tool="present"])){display:none!important}
html[data-ap-process-view="concise"] [data-chat-flow-kind="tool-call"]:has([data-state="error"],[data-state="stopped"],[data-state="warning"],[role="alert"],[role="dialog"],input,textarea,[data-tool*="ask"],[data-tool*="approval"],[data-tool*="confirm"]){content-visibility:visible!important;display:block!important}
html[data-ap-process-view="details"] [data-turn-process-member]{content-visibility:visible!important;display:block!important}
.ap-task-process{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary,#687280);max-width:520px}.ap-task-process span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ap-task-process button{white-space:nowrap;border:1px solid var(--border,#ddd);border-radius:8px;padding:5px 10px;background:transparent;color:inherit;cursor:pointer}
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
    const [details, setDetails] = React.useState(() => {
      try { return localStorage.getItem('agent-pi:execution-details') === 'true' } catch { return false }
    })
    const [, refresh] = React.useState(0)
    React.useEffect(() => {
      document.documentElement.dataset.apProcessView = details ? 'details' : 'concise'
      try { localStorage.setItem('agent-pi:execution-details', String(details)) } catch {}
      return () => { delete document.documentElement.dataset.apProcessView }
    }, [details])
    React.useEffect(() => {
      let timer
      const stop = subscribe(sessionId, () => {
        if (timer) return
        timer = setTimeout(() => { timer = null; refresh((n) => n + 1) }, 200)
      })
      return () => { clearTimeout(timer); stop?.() }
    }, [sessionId])
    const summary = taskProcessSummary(snapshot(sessionId), language())
    const zh = summary.language === 'zh'
    return h('div', { className: 'ap-task-process' },
      summary.text && h('span', { role: 'status', 'aria-live': 'polite' }, summary.text),
      h('button', { type: 'button', 'aria-pressed': details, onClick: () => setDetails((value) => !value), title: zh ? '切换工具和推理详情；完整记录仍在轨迹与 Session 日志中' : 'Toggle tool and reasoning details; full records remain in Trajectory and Session logs' }, details ? (zh ? '收起执行详情' : 'Hide execution details') : (zh ? '执行详情' : 'Execution details')),
    )
  }
}
