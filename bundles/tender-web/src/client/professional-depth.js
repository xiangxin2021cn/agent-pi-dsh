import { localizeDepthCopy } from './locales/professional-depth.js'

const fields = [
  ['purpose', '实际用途与受众', '成果用于什么工作、给谁使用或支持什么决策'],
  ['depth', '专业深度', '需要说明、分析、计算，还是可执行的交付成果'],
  ['evidence', '事实依据与缺口', '已知事实、所选资料、需要补充的关键条件'],
  ['format', '成果格式', '文件类型、模板、结构、图表与版式要求'],
  ['acceptance', '验收口径', '怎样判断任务已满足实际使用需求'],
]
const kinds = [['review', '专业审阅'], ['file', '文件与格式'], ['contains', '包含指定内容'], ['json', '有效 JSON']]
const pendingModes = new WeakMap()

// The switch is composer state, never a synthetic task. Materialize it only
// after the user submits actual text or an attachment through the native input.
export function prepareDepthSubmission(composer, draft, hasAttachments, locale = 'zh') {
  const pending = composer.inputActions && pendingModes.get(composer.inputActions)
  if (!pending || composer.sessionId || (!draft.trim() && !hasAttachments)) return draft
  pendingModes.delete(composer.inputActions)
  return String(locale).startsWith('zh')
    ? `启用专业深度。\n${draft}${pending.template ? `\n\n我主动选用以下模板作为参考，当前需求优先，模板中的旧事实不代表本次事实：\n<reference-template>\n${pending.template.content}\n</reference-template>` : ''}`
    : `Enable professional depth.\n${draft}${pending.template ? `\n\nI selected the following template as reference. The current task takes priority; old project facts in the template do not apply here:\n<reference-template>\n${pending.template.content}\n</reference-template>` : ''}`
}

export function createProfessionalDepth({ React, api, run, subscribe, useLanguage }) {
  const h = React.createElement
  return function ProfessionalDepth({ composer }) {
    const locale = useLanguage()
    const t = (value) => localizeDepthCopy(value, locale)
    const id = composer.sessionId || ''
    const [state, setState] = React.useState(null)
    const [edit, setEdit] = React.useState(null)
    const [open, setOpen] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState('')
    const [draftEnabled, setDraftEnabled] = React.useState(false)
    const [templates, setTemplates] = React.useState([])
    const [template, setTemplate] = React.useState(null)
    const [templateEdit, setTemplateEdit] = React.useState(null)
    const [savedPath, setSavedPath] = React.useState('')
    const templateRequest = (suffix = '', body) => api(`/api/agent-pi/professional-depth/templates${suffix}`, composer.cwd,
      body ? { method: 'POST', body: JSON.stringify(body) } : undefined)
    React.useEffect(() => () => {
      if (composer.inputActions) pendingModes.delete(composer.inputActions)
    }, [composer.inputActions])
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
      templateRequest().then(setTemplates).catch((err) => setError(String(err.message || err)))
      if (id) perform(async () => { setState(await request()) })
    }
    const enabled = id ? !!state?.enabled : draftEnabled
    const toggle = () => perform(async () => {
      if (!id) {
        if (composer.inputActions) {
          if (draftEnabled) pendingModes.delete(composer.inputActions)
          else pendingModes.set(composer.inputActions, { template })
        }
        setDraftEnabled(!draftEnabled)
        return
      }
      const latest = await request()
      const value = await request({ action: 'toggle', enabled: !latest.enabled, revision: latest.revision })
      setState(value); setEdit(null)
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
    const selectTemplate = (templateId) => perform(async () => {
      const selected = templateId ? await templateRequest(`?id=${encodeURIComponent(templateId)}`) : null
      if (id) {
        const latest = await request()
        setState(await request({ action: 'template', revision: latest.revision, template: selected }))
      } else if (composer.inputActions) pendingModes.set(composer.inputActions, { template: selected })
      setTemplate(selected)
    })
    const startTemplate = () => {
      setSavedPath('')
      setTemplateEdit({ title: '', content: locale.startsWith('zh')
        ? `## 触发场景\n描述适用的工作类型，去掉本项目名称和具体事实。\n\n## 需求澄清清单\n只列无法从任务推断、且会改变结果的关键问题。\n\n## 标准做法\n${state?.brief?.depth || '填写可复用的工作步骤。'}\n\n## 禁区\n填写应保留的边界，不携带凭据或项目敏感资料。\n\n## 提示词模板\n围绕实际用途完成任务；事实、资料和参数以本次输入为准。\n\n## 验收标准\n${state?.brief?.acceptance || '填写可检查的交付要求。'}`
        : `## When to use\nDescribe the type of work without project names or facts.\n\n## Questions to clarify\nList only unknowns that could change the result.\n\n## Standard approach\n${state?.brief?.depth || 'Describe reusable work steps.'}\n\n## Boundaries\nState what must be preserved; omit credentials and sensitive project data.\n\n## Prompt template\nComplete the task for its intended use. Use the current inputs for facts, sources and parameters.\n\n## Acceptance criteria\n${state?.brief?.acceptance || 'List verifiable delivery requirements.'}` })
    }
    const saveTemplate = () => perform(async () => {
      const saved = await templateRequest('', templateEdit)
      setSavedPath(saved.path); setTemplateEdit(null)
      setTemplates(await templateRequest())
    })
    const updateCriterion = (index, patch) => setEdit((current) => ({ ...current, criteria: current.criteria.map((row, i) => i === index ? { ...row, ...patch } : row) }))
    const shown = edit || state
    return h(React.Fragment, null,
      h('button', { type: 'button', className: `ap-codex-turn${enabled ? ' on' : ''}`, onClick: show, 'aria-label': t('专业深度'), 'aria-pressed': !!enabled, title: enabled ? t('查看任务说明和交付检查') : t('按实际用途研判任务、格式和验收要求') }, t('专业深度'), enabled ? t(' · 已启用') : ''),
      open && h('div', { className: 'ap-overlay ap-depth-overlay', onClick: (event) => { if (event.target === event.currentTarget && !edit) setOpen(false) } },
        h('section', { className: 'ap-modal ap-depth-modal', role: 'dialog', 'aria-modal': true, 'aria-label': t('专业深度任务说明') },
          h('button', { type: 'button', className: 'ap-close', 'aria-label': t('关闭专业深度面板'), onClick: () => setOpen(false) }, '×'),
          h('h2', null, t('专业深度')),
          h('p', { className: 'ap-sub' }, t('围绕实际用途、专业依据和交付要求，继续在当前 DSH 对话中完成任务。只使用你在本对话选定的知识库资料。')),
          h('div', { className: 'ap-row ap-depth-actions' },
            h('span', { className: 'ap-depth-status', role: 'status' }, enabled ? (!id || state?.needsAssessment ? t('已启用 · 等待你的任务输入') : t('任务说明 · 第 ') + state.revision + t(' 版')) : t('默认关闭')),
            h('button', { type: 'button', disabled: busy || !!edit, onClick: toggle }, enabled ? t('关闭专业深度') : t('启用专业深度')),
            state?.enabled && !edit && h('button', { type: 'button', disabled: busy, onClick: () => setEdit(structuredClone(state)) }, t('编辑任务说明')),
          ),
          h('p', { className: 'ap-sub' }, t('开启只保存选择，不发送消息。输入并发送实际任务后，明确需求直接执行，关键目标不清楚时再集中询问；新对话默认关闭。')),
          h('div', { className: 'ap-depth-templates' },
            h('h3', null, t('可复用模板')),
            h('p', { className: 'ap-sub' }, t('由你主动保存、选用。不会自动保存经验、扫描项目或向新对话加载模板。保存前请去掉本次项目事实。')),
            h('select', { 'aria-label': t('选用专业深度模板'), disabled: busy || !enabled, value: (id ? state?.template?.id : template?.id) || '', onChange: (e) => selectTemplate(e.target.value) },
              h('option', { value: '' }, t('不使用模板')), templates.map((item) => h('option', { key: item.id, value: item.id }, item.title))),
            h('button', { type: 'button', disabled: busy, onClick: startTemplate }, t('整理并保存为模板')),
            (id ? state?.template : template) && h('details', null, h('summary', null, t('查看已选模板')), h('pre', { className: 'ap-depth-notes' }, (id ? state.template : template).content)),
            templateEdit && h('div', { className: 'ap-depth-template-edit' },
              h('input', { 'aria-label': t('模板名称'), placeholder: t('例如：施工方案审阅'), value: templateEdit.title, maxLength: 120, onChange: (e) => setTemplateEdit((value) => ({ ...value, title: e.target.value })) }),
              h('textarea', { 'aria-label': t('模板内容'), rows: 12, maxLength: 24000, value: templateEdit.content, onChange: (e) => setTemplateEdit((value) => ({ ...value, content: e.target.value })) }),
              h('button', { type: 'button', disabled: busy || !templateEdit.title.trim(), onClick: saveTemplate }, t('保存模板')),
              h('button', { type: 'button', onClick: () => setTemplateEdit(null) }, t('取消')),
            ),
            savedPath && h('p', { role: 'status', className: 'ap-depth-notes' }, t('已保存 Markdown 模板：') + savedPath + t('。本次未自动选用。')),
          ),
          error && h('p', { role: 'alert', className: 'ap-depth-error' }, error, ' ', h('button', { type: 'button', onClick: () => perform(async () => { setState(await request()); setEdit(null) }) }, t('载入最新版本'))),
          shown && h('div', { className: 'ap-depth-fields' }, fields.map(([field, label, placeholder]) =>
            h('label', { key: field }, h('strong', null, t(label)), edit
              ? h('textarea', { value: edit.brief[field], maxLength: 6000, rows: 3, placeholder: t(placeholder), onChange: (event) => updateField(field, event.target.value) })
              : h('p', null, shown.brief[field] || t('发送任务后，由当前智能体结合实际需求整理。'))))),
          shown && h('div', { className: 'ap-depth-criteria' },
            h('h3', null, t('验收项与交付检查')),
            h('p', { className: 'ap-sub' }, t('文件检查仅证明所列条件。专业准确性、计算和视觉版式需结合实际证据审阅；检查结果记录当时的文件内容。')),
            shown.criteria.map((criterion, index) => {
              const result = state.checks.find((item) => item.id === criterion.id)
              return h('div', { key: criterion.id, className: 'ap-depth-criterion' }, edit
                ? h(React.Fragment, null,
                  h('input', { 'aria-label': t('验收项 ') + (index + 1), value: criterion.title, placeholder: t('具体的验收条件'), onChange: (e) => updateCriterion(index, { title: e.target.value }) }),
                  h('select', { 'aria-label': t('检查方式 ') + (index + 1), value: criterion.kind, onChange: (e) => updateCriterion(index, { kind: e.target.value }) }, kinds.map(([value, label]) => h('option', { key: value, value }, t(label)))),
                  criterion.kind !== 'review' && h('input', { 'aria-label': t('文件路径 ') + (index + 1), value: criterion.path || '', placeholder: t('相对于当前工作区的文件路径'), onChange: (e) => updateCriterion(index, { path: e.target.value }) }),
                  criterion.kind === 'contains' && h('input', { 'aria-label': t('预期内容 ') + (index + 1), value: criterion.expected || '', placeholder: t('必须包含的实际文本'), onChange: (e) => updateCriterion(index, { expected: e.target.value }) }),
                  h('button', { type: 'button', onClick: () => setEdit((current) => ({ ...current, criteria: current.criteria.filter((_, i) => i !== index) })) }, t('移除')),
                ) : h(React.Fragment, null,
                  h('strong', null, criterion.title),
                  h('span', { className: `ap-depth-check ${result?.status || 'pending'}` }, result ? ({ passed: t('机器检查通过'), failed: t('检查未通过'), review: t('需专业审阅') })[result.status] : t('待检查')),
                  criterion.path && h('p', { className: 'ap-sub' }, criterion.path),
                  result && h('p', { className: 'ap-sub' }, result.detail),
                ))
            }),
            edit && h('button', { type: 'button', disabled: edit.criteria.length >= 20, onClick: () => setEdit((current) => ({ ...current, criteria: [...current.criteria, { id: crypto.randomUUID(), title: '', kind: 'review' }] })) }, t('添加验收项')),
            !shown.criteria.length && h('p', { className: 'ap-sub' }, t('尚未形成验收项。')),
            !edit && state.reviewNotes && h('div', null, h('h4', null, t('专业审阅记录')), h('p', { className: 'ap-depth-notes' }, state.reviewNotes)),
          ),
          edit && h('div', { className: 'ap-row ap-depth-actions' },
            h('button', { type: 'button', disabled: busy, onClick: () => save(true) }, t('保存并继续任务')),
            h('button', { type: 'button', disabled: busy, onClick: () => save(false) }, t('仅保存要求')),
            h('button', { type: 'button', disabled: busy, onClick: () => setEdit(null) }, t('取消修改')),
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
.ap-depth-template-edit input,.ap-depth-template-edit textarea{width:100%;box-sizing:border-box;margin:8px 0;padding:9px;background:var(--background,#fff);color:inherit;border:1px solid var(--border,#ddd);border-radius:8px;font:inherit}.ap-depth-templates select{max-width:100%;padding:7px;margin-right:10px;background:var(--background,#fff);color:inherit;border:1px solid var(--border,#ddd);border-radius:8px}.ap-depth-templates pre{font:inherit}
.ap-depth-actions{flex-wrap:wrap;gap:10px;margin:14px 0}.ap-depth-criterion{padding:12px 0;border-top:1px solid var(--border,#ddd);display:flex;flex-wrap:wrap;gap:8px}.ap-depth-criterion p{width:100%;margin:0}.ap-depth-check{font-size:12px;border-radius:5px;padding:3px 7px;background:#edf3f4}.ap-depth-check.failed,.ap-depth-error{color:#b42318}.ap-depth-check.passed{color:#166534}.ap-depth-check.review{color:#825600}.ap-depth-status{margin-right:auto}
@media(max-width:600px){.ap-depth-fields{grid-template-columns:1fr}.ap-depth-modal{padding:20px}}
`
