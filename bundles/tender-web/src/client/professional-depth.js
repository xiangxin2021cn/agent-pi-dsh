const fields = [
  ['purpose', '实际用途与受众', '成果用于什么工作、给谁使用或支持什么决策'],
  ['depth', '专业深度', '需要说明、分析、计算，还是可执行的交付成果'],
  ['evidence', '事实依据与缺口', '已知事实、所选资料、需要补充的关键条件'],
  ['format', '成果格式', '文件类型、模板、结构、图表与版式要求'],
  ['acceptance', '验收口径', '怎样判断任务已满足实际使用需求'],
]
const kinds = [['review', '专业审阅'], ['file', '文件与格式'], ['contains', '包含指定内容'], ['json', '有效 JSON']]

export function createProfessionalDepth({ React, api, fillDraft, run, subscribe }) {
  const h = React.createElement
  return function ProfessionalDepth({ composer }) {
    const id = composer.sessionId || ''
    const [state, setState] = React.useState(null)
    const [edit, setEdit] = React.useState(null)
    const [open, setOpen] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState('')
    const url = `/api/agent-pi/professional-depth?sessionId=${encodeURIComponent(id)}`
    const request = (body) => api(url, composer.cwd, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)
    React.useEffect(() => {
      if (!id) return
      let disposed = false
      let timer
      const refresh = () => request().then((value) => { if (!disposed) setState(value) }).catch(() => {})
      refresh()
      const unsubscribe = subscribe(id, () => {
        clearTimeout(timer)
        timer = setTimeout(refresh, 250)
      })
      return () => { disposed = true; clearTimeout(timer); unsubscribe?.() }
    }, [id, composer.cwd])
    React.useEffect(() => {
      if (!open || !id) return
      let disposed = false
      const timer = setInterval(() => request().then((value) => { if (!disposed) setState(value) }).catch(() => {}), 2500)
      return () => { disposed = true; clearInterval(timer) }
    }, [open, id, composer.cwd])
    const perform = async (action) => {
      setBusy(true); setError('')
      try { await action() } catch (err) { setError(String(err.message || err)) }
      finally { setBusy(false) }
    }
    const show = () => {
      setOpen(true); setEdit(null); setError('')
      if (id) perform(async () => { setState(await request()) })
    }
    const draftEnabled = !id && /^启用专业深度。\n/.test(composer.input?.draft || '')
    const enabled = state?.enabled || draftEnabled
    const toggle = () => perform(async () => {
      if (!id) {
        const draft = composer.input?.draft || ''
        fillDraft(composer, draftEnabled ? draft.replace(/^启用专业深度。\n/, '') : `启用专业深度。\n${draft}`)
        setOpen(false)
        return
      }
      const latest = await request()
      const value = await request({ action: 'toggle', enabled: !latest.enabled, revision: latest.revision })
      setState(value); setEdit(null)
      if (value.enabled) {
        setOpen(false)
        run(composer, '请按专业深度研判当前任务：结合已有对话整理任务说明和验收要求，然后继续完成。')
      }
    })
    const save = (continueTask) => perform(async () => {
      const value = await request({ action: 'brief', revision: edit.revision, brief: edit.brief, criteria: edit.criteria })
      setState(value); setEdit(null)
      if (continueTask) {
        setOpen(false)
        run(composer, '我已修改专业深度任务说明，请按最新版本定向调整受影响的成果，并重新检查相关验收项。')
      }
    })
    const updateField = (field, value) => setEdit((current) => ({ ...current, brief: { ...current.brief, [field]: value } }))
    const updateCriterion = (index, patch) => setEdit((current) => ({ ...current, criteria: current.criteria.map((row, i) => i === index ? { ...row, ...patch } : row) }))
    const shown = edit || state
    return h(React.Fragment, null,
      h('button', { type: 'button', className: `ap-codex-turn${enabled ? ' on' : ''}`, onClick: show, 'aria-label': '专业深度', 'aria-pressed': !!enabled, title: enabled ? '查看任务说明和交付检查' : '按实际用途研判任务、格式和验收要求' }, '专业深度', enabled ? ' · 已启用' : ''),
      open && h('div', { className: 'ap-overlay ap-depth-overlay', onClick: (event) => { if (event.target === event.currentTarget && !edit) setOpen(false) } },
        h('section', { className: 'ap-modal ap-depth-modal', role: 'dialog', 'aria-modal': true, 'aria-label': '专业深度任务说明' },
          h('button', { type: 'button', className: 'ap-close', 'aria-label': '关闭专业深度面板', onClick: () => setOpen(false) }, '×'),
          h('h2', null, '专业深度'),
          h('p', { className: 'ap-sub' }, '围绕实际用途、专业依据和交付要求，继续在当前 DSH 对话中完成任务。只使用你在本对话选定的知识库资料。'),
          h('div', { className: 'ap-row ap-depth-actions' },
            h('span', { className: 'ap-depth-status', role: 'status' }, draftEnabled ? '发送任务后启用' : enabled ? (state.needsAssessment ? '待研判最新要求' : `任务说明 · 第 ${state.revision} 版`) : '默认关闭'),
            h('button', { type: 'button', disabled: busy || !!edit, onClick: toggle }, enabled ? '关闭专业深度' : id ? '启用并开始研判' : '加入当前任务'),
            state?.enabled && !edit && h('button', { type: 'button', disabled: busy, onClick: () => setEdit(structuredClone(state)) }, '编辑任务说明'),
          ),
          !id && h('p', { className: 'ap-sub' }, '先在输入框描述工作需求。加入专业深度后，发送任务即可自动研判；新对话不会继承此模式。'),
          error && h('p', { role: 'alert', className: 'ap-depth-error' }, error, ' ', h('button', { type: 'button', onClick: () => perform(async () => { setState(await request()); setEdit(null) }) }, '载入最新版本')),
          shown && h('div', { className: 'ap-depth-fields' }, fields.map(([field, label, placeholder]) =>
            h('label', { key: field }, h('strong', null, label), edit
              ? h('textarea', { value: edit.brief[field], maxLength: 6000, rows: 3, placeholder, onChange: (event) => updateField(field, event.target.value) })
              : h('p', null, shown.brief[field] || '发送任务后，由当前智能体结合实际需求整理。')))),
          shown && h('div', { className: 'ap-depth-criteria' },
            h('h3', null, '验收项与交付检查'),
            h('p', { className: 'ap-sub' }, '文件检查仅证明所列条件。专业准确性、计算和视觉版式需结合实际证据审阅；检查结果记录当时的文件内容。'),
            shown.criteria.map((criterion, index) => {
              const result = state.checks.find((item) => item.id === criterion.id)
              return h('div', { key: criterion.id, className: 'ap-depth-criterion' }, edit
                ? h(React.Fragment, null,
                  h('input', { 'aria-label': `验收项 ${index + 1}`, value: criterion.title, placeholder: '具体的验收条件', onChange: (e) => updateCriterion(index, { title: e.target.value }) }),
                  h('select', { 'aria-label': `检查方式 ${index + 1}`, value: criterion.kind, onChange: (e) => updateCriterion(index, { kind: e.target.value }) }, kinds.map(([value, label]) => h('option', { key: value, value }, label))),
                  criterion.kind !== 'review' && h('input', { 'aria-label': `文件路径 ${index + 1}`, value: criterion.path || '', placeholder: '相对于当前工作区的文件路径', onChange: (e) => updateCriterion(index, { path: e.target.value }) }),
                  criterion.kind === 'contains' && h('input', { 'aria-label': `预期内容 ${index + 1}`, value: criterion.expected || '', placeholder: '必须包含的实际文本', onChange: (e) => updateCriterion(index, { expected: e.target.value }) }),
                  h('button', { type: 'button', onClick: () => setEdit((current) => ({ ...current, criteria: current.criteria.filter((_, i) => i !== index) })) }, '移除'),
                ) : h(React.Fragment, null,
                  h('strong', null, criterion.title),
                  h('span', { className: `ap-depth-check ${result?.status || 'pending'}` }, result ? ({ passed: '机器检查通过', failed: '检查未通过', review: '需专业审阅' })[result.status] : '待检查'),
                  criterion.path && h('p', { className: 'ap-sub' }, criterion.path),
                  result && h('p', { className: 'ap-sub' }, result.detail),
                ))
            }),
            edit && h('button', { type: 'button', disabled: edit.criteria.length >= 20, onClick: () => setEdit((current) => ({ ...current, criteria: [...current.criteria, { id: crypto.randomUUID(), title: '', kind: 'review' }] })) }, '添加验收项'),
            !shown.criteria.length && h('p', { className: 'ap-sub' }, '尚未形成验收项。'),
            !edit && state.reviewNotes && h('div', null, h('h4', null, '专业审阅记录'), h('p', { className: 'ap-depth-notes' }, state.reviewNotes)),
          ),
          edit && h('div', { className: 'ap-row ap-depth-actions' },
            h('button', { type: 'button', disabled: busy, onClick: () => save(true) }, '保存并继续任务'),
            h('button', { type: 'button', disabled: busy, onClick: () => save(false) }, '仅保存要求'),
            h('button', { type: 'button', disabled: busy, onClick: () => setEdit(null) }, '取消修改'),
          ),
        ),
      ),
    )
  }
}

export const professionalDepthCss = `
.ap-depth-overlay{z-index:10080}.ap-depth-modal{max-width:780px;width:calc(100vw - 36px);max-height:85vh;overflow:auto;padding:28px}
.ap-depth-fields{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:20px 0}.ap-depth-fields label:last-child{grid-column:1/-1}
.ap-depth-fields strong{display:block;margin-bottom:6px}.ap-depth-fields p,.ap-depth-notes{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}
.ap-depth-modal button:not(.ap-close){border:1px solid var(--border,#d7dce2);border-radius:8px;padding:7px 12px;background:var(--background,#fff);color:inherit;font:inherit;cursor:pointer}.ap-depth-modal button:disabled{opacity:.5;cursor:default}
.ap-depth-fields textarea,.ap-depth-criterion input,.ap-depth-criterion select{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--border,#ddd);border-radius:8px;background:var(--background,#fff);color:inherit;font:inherit}
.ap-depth-actions{flex-wrap:wrap;gap:10px;margin:14px 0}.ap-depth-criterion{padding:12px 0;border-top:1px solid var(--border,#ddd);display:flex;flex-wrap:wrap;gap:8px}.ap-depth-criterion p{width:100%;margin:0}.ap-depth-check{font-size:12px;border-radius:5px;padding:3px 7px;background:#edf3f4}.ap-depth-check.failed,.ap-depth-error{color:#b42318}.ap-depth-check.passed{color:#166534}.ap-depth-check.review{color:#825600}.ap-depth-status{margin-right:auto}
@media(max-width:600px){.ap-depth-fields{grid-template-columns:1fr}.ap-depth-modal{padding:20px}}
`
