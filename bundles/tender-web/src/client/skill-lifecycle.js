const statuses = { candidate: ['候选，尚未加载', 'Candidate, not loaded'], published: ['已发布', 'Published'], retired: ['已退役', 'Retired'], legacy_unvalidated: ['旧手工版本，未验证', 'Legacy manual version, unvalidated'] }
const valueOf = value => typeof value === 'function' ? value() : value

export function createSkillLifecycle({ React, api, cwd, sessionId, language, onChanged }) {
  const h = React.createElement
  return function SkillLifecyclePanel(props = {}) {
    const currentCwd = props.cwd ?? valueOf(cwd) ?? '', currentSession = props.sessionId ?? valueOf(sessionId) ?? ''
    const zh = String(valueOf(language) || 'zh').startsWith('zh'), t = (cn, en) => zh ? cn : en
    const [data, setData] = React.useState(null), [selected, setSelected] = React.useState(null), [detail, setDetail] = React.useState(null)
    const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState('')
    const [caseDraft, setCaseDraft] = React.useState({ caseId: '', inputPath: '', expectedOutputPath: '', actualOutputPath: '' })
    const [humanSelected, setHumanSelected] = React.useState(false), [confirmPublish, setConfirmPublish] = React.useState(false)
    const [decision, setDecision] = React.useState('')
    const scope = currentCwd + '\n' + currentSession, scopeRef = React.useRef(scope)
    scopeRef.current = scope
    const request = (body) => api(`/api/agent-pi/skills?sessionId=${encodeURIComponent(currentSession)}`, currentCwd,
      body ? { method: 'POST', body: JSON.stringify({ ...body, sessionId: currentSession }) } : { method: 'GET' })
    React.useEffect(() => {
      let active = true
      setData(null); setSelected(null); setDetail(null); setError(''); setNotice(''); setDecision(''); setConfirmPublish(false); setHumanSelected(false); setBusy(false)
      setCaseDraft({ caseId: '', inputPath: '', expectedOutputPath: '', actualOutputPath: '' })
      request().then(value => { if (active) setData(value) }).catch(err => { if (active) setError(String(err.message || err)) })
      return () => { active = false }
    }, [scope])
    const perform = async fn => {
      setBusy(true); setError(''); setNotice('')
      try { await fn() } catch (err) { if (scopeRef.current === scope) setError(String(err.message || err)) }
      finally { if (scopeRef.current === scope) setBusy(false) }
    }
    const choose = (slug, versionId) => perform(async () => {
      const value = await request({ action: 'read', slug, versionId })
      if (scopeRef.current !== scope) return
      setSelected({ slug, versionId }); setDetail(value); setDecision(''); setConfirmPublish(false); setHumanSelected(false)
    })
    const mutate = body => perform(async () => {
      await request({ ...selected, ...body })
      const [list, value] = await Promise.all([request(), request({ action: 'read', ...selected })])
      if (scopeRef.current !== scope) return
      setData(list); setDetail(value); setHumanSelected(false); setConfirmPublish(false); setDecision('')
      setNotice(t('操作已保存。', 'Saved.')); (props.onChanged || onChanged)?.()
    })
    const list = data?.lifecycles || [], known = new Set(list.map(row => row.slug))
    const version = detail?.version, lifecycle = detail?.lifecycle, status = lifecycle?.versions?.find(row => row.versionId === selected?.versionId)?.status
    const cases = lifecycle?.validations?.filter(row => row.versionId === selected?.versionId) || []
    const canPublish = detail?.sourceReady && cases.length > 0 && cases.every(row => row.passed) && ['candidate', 'published'].includes(status)
    const independentSession = currentSession && currentSession !== version?.sourceTaskId
    const field = (key, cn, en) => h('label', { className: 'ap-skill-field', key }, t(cn, en), h('input', { value: caseDraft[key], disabled: busy, onChange: event => setCaseDraft(old => ({ ...old, [key]: event.target.value })) }))
    return h('section', { className: 'ap-skill-lifecycle', 'aria-label': t('技能版本与独立验证', 'Skill versions and independent validation') },
      h('h3', null, t('技能版本与独立验证', 'Skill versions and independent validation')),
      h('p', null, t('候选技能保留来源、适用前提和失败条件。只有来源成果被用户验收、独立案例验证通过并经人工批准后，才发布为可加载技能。', 'Candidates retain their source, applicability and failure conditions. Publication requires an accepted source deliverable, independent validation and human approval.')),
      error && h('p', { role: 'alert' }, error), notice && h('p', { role: 'status' }, notice),
      !data && !error && h('p', null, t('正在读取技能…', 'Loading skills…')),
      data && !list.length && !(data.skills || []).length && h('p', null, t('尚无候选或用户技能。可在主对话中整理方法并保存候选，再到这里验证。', 'No candidates or user skills yet. Ask the main conversation to save a method candidate, then validate it here.')),
      list.map(row => h('div', { key: row.slug, className: 'ap-skill-versions' }, h('strong', null, row.slug), row.versions.map(item => h('button', { key: item.versionId, type: 'button', disabled: busy, 'aria-pressed': selected?.slug === row.slug && selected?.versionId === item.versionId, onClick: () => choose(row.slug, item.versionId) }, `${t(...(statuses[item.status] || statuses.legacy_unvalidated))} · ${item.versionId.slice(0, 10)}${row.currentVersionId === item.versionId ? t(' · 当前', ' · Current') : ''}`)))),
      (data?.skills || []).filter(row => !known.has(row.slug)).map(row => h('p', { key: row.slug }, `${row.slug} · ${t(...statuses.legacy_unvalidated)}`)),
      version && h('div', { className: 'ap-skill-detail' },
        h('h4', null, `${version.slug} · ${version.versionId.slice(0, 10)}`),
        h('p', null, t('来源任务：', 'Source task: ') + version.sourceTaskId), h('p', null, t('来源成果：', 'Source artifact: ') + version.sourceArtifact.path),
        h('p', null, t('适用前提：', 'Applicability: ') + (version.applicability || []).join('；')), h('p', null, t('失败条件：', 'Failure conditions: ') + (version.failureModes || []).join('；')),
        !detail.sourceReady && status !== 'legacy_unvalidated' && h('p', { role: 'status' }, t('发布尚未就绪：', 'Publication not ready: ') + detail.sourceReason),
        h('details', null, h('summary', null, t('查看候选正文', 'View candidate text')), h('pre', null, version.markdown)),
        h('p', { className: 'ap-skill-limitation' }, t('验证方式：人工选定的独立案例，输入、独立预期和实际输出均保留文件指纹，只核对输出字节是否一致。这只证明登记的固定案例，不证明任意任务的语义质量或技能的自动执行效果。', 'Validation uses a human-selected independent case, retaining hashes of its input, reference and actual output. Exact byte equality only proves this fixed case; it does not establish general semantic quality or automatic skill execution.')),
        cases.map(row => h('p', { key: row.caseId }, `${row.caseId} · ${row.passed ? t('固定案例通过', 'Fixed case passed') : t('输出不一致', 'Output differs')} · ${row.verificationMethod}`)),
        ['candidate', 'published'].includes(status) && h('form', { onSubmit: event => { event.preventDefault(); mutate({ action: 'validate', ...caseDraft, humanSelected }) } },
          h('h4', null, t('登记独立案例', 'Register an independent case')),
          h('p', null, t('当前验证会话：', 'Current validation session: ') + (currentSession || t('请先选择会话', 'Select a session first'))),
          !independentSession && h('p', null, t('请在另一个独立任务会话中验证，不能复用来源任务。', 'Validate in another independent task session; the source task cannot serve as its own case.')),
          field('caseId', '案例编号（保存后冻结）', 'Case ID (frozen after saving)'), field('inputPath', '独立输入文件', 'Independent input file'), field('expectedOutputPath', '人工选定的独立预期文件', 'Human-selected reference file'), field('actualOutputPath', '实际输出文件', 'Actual output file'),
          h('label', { className: 'ap-skill-check' }, h('input', { type: 'checkbox', checked: humanSelected, disabled: busy, onChange: event => setHumanSelected(event.target.checked) }), t('我确认已人工选择这个独立案例和预期文件；预期不是模型为本次结果临时编造的标准。', 'I selected this independent case and reference; the reference was not invented by the model to match this result.')),
          h('button', { type: 'submit', disabled: busy || !independentSession || !humanSelected || Object.values(caseDraft).some(value => !value.trim()) }, t('冻结案例并验证', 'Freeze case and validate'))),
        ['candidate', 'published'].includes(status) && h('div', null,
          h('label', { className: 'ap-skill-check' }, h('input', { type: 'checkbox', checked: confirmPublish, disabled: busy, onChange: event => setConfirmPublish(event.target.checked) }), t('我批准发布此版本，并理解固定案例验证的局限和上述适用条件。', 'I approve publication and understand the fixed-case limitation and applicability conditions.')),
          h('button', { type: 'button', disabled: busy || !currentSession || !canPublish || !confirmPublish, onClick: () => mutate({ action: 'publish', confirmPublish }) }, t('批准并发布', 'Approve and publish'))),
        ['published', 'legacy_unvalidated'].includes(status) && h('button', { type: 'button', disabled: busy || !currentSession, onClick: () => setDecision('rollback') }, t('回滚到此版本', 'Roll back to this version')),
        status !== 'retired' && h('button', { type: 'button', disabled: busy || !currentSession, onClick: () => setDecision('retire') }, t('退役此版本', 'Retire this version')),
        decision && h('div', { role: 'group', 'aria-label': t('确认版本操作', 'Confirm version action') }, h('p', null, decision === 'retire' ? t('退役将停止加载此版本，历史记录保留。', 'Retirement stops loading this version and retains its history.') : t('回滚将恢复所选正文，旧手工版本仍标记为未验证。', 'Rollback restores this text; legacy manual versions remain unvalidated.')), h('button', { type: 'button', disabled: busy, onClick: () => mutate({ action: decision, confirm: true }) }, t('确认操作', 'Confirm action')), h('button', { type: 'button', disabled: busy, onClick: () => setDecision('') }, t('取消', 'Cancel')))))
  }
}

export function skillLifecycleCss() {
  return `.ap-skill-lifecycle{margin-top:20px;border-top:1px solid var(--ap-line,#dbe2e8);padding-top:16px}.ap-skill-lifecycle p{overflow-wrap:anywhere}.ap-skill-versions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.ap-skill-versions button[aria-pressed=true]{outline:2px solid var(--ap-accent,#2a617a)}.ap-skill-detail{border:1px solid var(--ap-line,#dbe2e8);border-radius:8px;padding:16px;margin-top:12px}.ap-skill-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto}.ap-skill-field{display:block;margin:10px 0}.ap-skill-field input{display:block;width:100%;box-sizing:border-box;margin-top:4px}.ap-skill-check{display:flex;gap:8px;align-items:flex-start;margin:12px 0}.ap-skill-check input{flex:none;margin-top:3px}.ap-skill-limitation{padding:10px;background:var(--ap-subtle,#f3f6f8)}.ap-skill-detail button{margin:4px 8px 4px 0}.ap-skill-lifecycle [role=alert]{color:var(--ap-danger,#b42318)}`
}
