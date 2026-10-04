import { taskOverviewModel } from './professional-task-summary.js'

/** Task status only; native Chat settings own work-details presentation. */
export const taskProcessCss = `
.ap-task-process{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary,#687280);max-width:520px}.ap-task-process span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

export function taskProcessSummary(snapshot, fallbackLanguage = 'zh', professionalTask = snapshot?.professionalTask) {
  const nodes = snapshot?.chat?.legacy?.nodes || []
  const lastUser = [...nodes].reverse().find((node) => (node.kind === 'user' || node.kind === 'steering') && node.source?.kind === 'user')
  const text = (lastUser?.content || []).filter((part) => part.type === 'text').map((part) => part.text).join(' ')
  const language = /[\u3400-\u9fff]/u.test(text) ? 'zh' : /[a-zA-Z]/.test(text) ? 'en' : fallbackLanguage
  if (!snapshot?.running && !['running','waiting'].includes(snapshot?.phase)) return { language, text: '' }
  if (professionalTask) {
    const model = taskOverviewModel(professionalTask)
    const rows = []
    if (model.currentStep) rows.push((language === 'zh' ? '正在解决：' : 'Current focus: ') + model.currentStep.title)
    if (model.coverage.total) rows.push((language === 'zh' ? '已抽取 ' : 'Extracted ') + model.coverage.parsed + '/' + model.coverage.total + (language === 'zh' ? '，专业复核 ' : '; professional review ') + model.coverage.reviewed + '/' + model.coverage.total)
    if (model.questions.length) rows.push(model.questions.length + (language === 'zh' ? ' 个问题待明确' : ' questions to clarify'))
    if (rows.length) return {language,text:rows.join(' · ')}
  }
  if (snapshot?.phase === 'waiting') return {language,text:language === 'zh'?'等待确认或补充信息':'Waiting for confirmation or information'}
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

export function createTaskProcess({ React, snapshot, subscribe, language, professionalTask }) {
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
    const summary = taskProcessSummary(snapshot(sessionId), language(), professionalTask?.(sessionId))
    if (!summary.text) return null
    return h('div', { className: 'ap-task-process' },
      h('span', { role: 'status', 'aria-live': 'polite' }, summary.text),
    )
  }
}
