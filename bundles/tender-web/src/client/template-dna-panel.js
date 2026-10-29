const layerLabels = { L1: '语言与表达', L2: '章节与结构', L3: '内容范围与切入', L4: '素材与证据', L5: '判断依据与深度', L6: '版式与视觉' }
const statusLabels = { observed: '已识别', partial: '部分识别', unknown: '待核对' }
export const isUserTemplate = value => ['用户模板', '用户模版', '模板', '模版'].includes(value)

export function createTemplateDnaPanel({ React, api }) {
  const h = React.createElement
  return function TemplateDnaPanel({ cwd, entry, binding, onUseProfile, onChanged, useLabel = '本次按此范本', useHint = '每次任务使用一个主范本，选用会替换原主范本；不会自动启动编写或覆盖文档。' }) {
    const [open, setOpen] = React.useState(false), [profiles, setProfiles] = React.useState([]), [selectedId, setSelectedId] = React.useState('')
    const [busy, setBusy] = React.useState(''), [error, setError] = React.useState(''), [notice, setNotice] = React.useState(''), [analysis, setAnalysis] = React.useState(null)
    const requestId = React.useRef(0), mounted = React.useRef(true)
    const slug = entry.slug, versionId = entry.versionId
    const profile = profiles.find(row => row.dnaId === selectedId) || null
    const selected = profile && binding?.dnaId === profile.dnaId && binding?.versionId === profile.source.versionId
    const ai = analysis?.dnaId === profile?.dnaId ? analysis : null
    const ready = entry.parseStatus === 'ready' && /^[a-f0-9]{64}$/.test(versionId || '')
    const post = body => api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify(body) })
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++ } }, [])
    async function load() {
      const token = ++requestId.current
      setBusy('读取范本规则'); setError(''); setNotice('')
      try {
        const results = await Promise.allSettled([
          post({ action: 'template_dna_list', slug, versionId }),
          binding?.dnaId ? post({ action: 'template_dna_read', slug, versionId: binding.versionId, dnaId: binding.dnaId }) : Promise.resolve(null),
        ])
        if (!mounted.current || token !== requestId.current) return
        const list = results[0].status === 'fulfilled' ? results[0].value.profiles || [] : []
        const bound = results[1].status === 'fulfilled' ? results[1].value?.profile : null
        const rows = bound && !list.some(row => row.dnaId === bound.dnaId) ? [bound, ...list] : list
        setProfiles(rows); setSelectedId(bound?.dnaId || rows[0]?.dnaId || '')
        const failure = results.find(result => result.status === 'rejected')
        if (failure) setError(failure.reason?.message || '范本规则暂时无法读取，请重试。')
      } catch (e) { if (mounted.current && token === requestId.current) setError(e.message) }
      finally { if (mounted.current && token === requestId.current) setBusy('') }
    }
    React.useEffect(() => {
      setProfiles([]); setSelectedId(''); setError(''); setNotice(''); setAnalysis(null)
      if (open && ready) void load()
      return () => { requestId.current++ }
    }, [open, cwd, slug, versionId, binding?.dnaId, binding?.versionId, ready])
    function announce(profile) {
      const detail = { cwd, slug, versionId: profile.source.versionId, dnaId: profile.dnaId }
      window.dispatchEvent(new window.CustomEvent('agent-pi-kb-changed', { detail }))
      window.dispatchEvent(new window.CustomEvent('agent-pi-project-state-changed', { detail }))
    }
    async function distill(intelligent = false) {
      const token = ++requestId.current
      setBusy(intelligent ? '正在AI蒸馏表达与深度' : '正在提取范本规则'); setError(''); setNotice('')
      try {
        const body = await post({ action: 'template_dna_distill', slug, versionId, intelligent, localOnly: !intelligent })
        if (!mounted.current || token !== requestId.current) return
        if (!body.profile?.dnaId) throw new Error('未获得可核对的范本规则，请重试。')
        setAnalysis(body.ai ? { ...body.ai, dnaId: body.profile.dnaId } : null)
        setProfiles(rows => [body.profile, ...rows.filter(row => row.dnaId !== body.profile.dnaId)])
        setSelectedId(body.profile.dnaId); setNotice(intelligent && body.profile.method !== 'grounded-ai' ? 'AI分析未形成有效规则，已保留本机提取结果；原因见下方。' : '规则已提取，请核对来源与待确认项；选用后才约束本次任务。')
        announce(body.profile); onChanged?.()
      } catch (e) { if (mounted.current && token === requestId.current) setError(e.message) }
      finally { if (mounted.current && token === requestId.current) setBusy('') }
    }
    async function useProfile() {
      if (!profile || !onUseProfile) return
      const token = ++requestId.current
      setBusy('正在选用范本'); setError(''); setNotice('')
      try {
        await onUseProfile(profile)
        if (!mounted.current || token !== requestId.current) return
        setNotice('已选用此固定版本的范本规则。' + useHint); announce(profile)
      } catch (e) { if (mounted.current && token === requestId.current) setError(e.message) }
      finally { if (mounted.current && token === requestId.current) setBusy('') }
    }
    const button = (label, onClick, disabled = false) => h('button', { type: 'button', className: 'ap-btn', onClick, disabled: !!busy || disabled }, label)
    return h('details', { className: 'ap-sec ap-template-dna', onToggle: event => setOpen(event.currentTarget.open), 'data-template-slug': slug },
      h('summary', null, '范本规则 · 蒸馏与选用', binding?.dnaId ? ' · 已关联' : ''),
      open && h(React.Fragment, null,
        h('p', { className: 'ap-sub' }, '从当前文档提取可复用的结构、表达和版式规则。单份范本不能代表完整作者风格；原项目名称、数字、资质和结论不能直接套用。'),
        !ready ? h('p', { role: 'status' }, '原件解析完成并形成固定版本后，可提取范本规则。') : h('div', { className: 'ap-row', style: { gap: 8, flexWrap: 'wrap' } }, button(profiles.length ? '重新提取当前范本' : '提取范本规则', () => distill(false)), button('AI蒸馏表达与深度（当前模型）', () => distill(true)), button('刷新规则', load)),
        ready && h('p', { className: 'ap-sub' }, '本机提取不会调用模型。点击AI蒸馏会将当前范本片段交给已配置的模型，分析候选仍须结合本次任务核对。'),
        busy && h('p', { role: 'status' }, busy + '…'), error && h('p', { role: 'alert', className: 'ap-err' }, error), notice && h('p', { role: 'status', className: 'ap-sub' }, notice),
        profiles.length > 1 && h('label', { className: 'ap-mm-field' }, '选择范本规则版本', h('select', { value: selectedId, disabled: !!busy, onChange: event => { setSelectedId(event.target.value); setNotice('') } }, profiles.map(row => h('option', { key: row.dnaId, value: row.dnaId }, new Date(row.createdAt).toLocaleString() + (row.dnaId === binding?.dnaId ? ' · 当前选用' : ''))))),
        profile && h('div', { style: { overflowWrap: 'anywhere' } },
          h('p', null, h('strong', null, profile.source.name || entry.name || slug), ' · 固定来源 ', profile.source.versionId.slice(0, 12), selected ? ' · 当前选用' : ''),
          h('p', { className: 'ap-sub' }, '提取方式：', profile.method === 'grounded-ai' ? 'AI有据分析候选' : '本机规则提取'),
          ai?.status && h('p', { className: 'ap-sub' }, 'AI分析状态：', ({ completed: '已完成', failed: '未完成，保留本机提取', unavailable: '当前不可用，保留本机提取' })[ai.status] || ai.status, ai.reason ? ' · ' + ai.reason : ''),
          profile.source.versionId !== versionId && h('p', { className: 'ap-sub' }, '当前任务固定的是历史范本版本。重新提取当前文档不会自动替换它。'),
          ...(profile.warnings || []).map((warning, index) => h('p', { className: 'ap-sub', key: 'warning-' + index }, warning)),
          ...(profile.layers || []).map(layer => h('details', { key: layer.id, open: layer.status === 'unknown', style: { margin: '8px 0' } },
            h('summary', null, layerLabels[layer.id] || layer.title, ' · ', statusLabels[layer.status] || '待核对'),
            ...(layer.observations || []).map((text, index) => h('p', { key: 'rule-' + index }, text)),
            ...(layer.unknowns || []).map((text, index) => h('p', { key: 'unknown-' + index, className: 'ap-sub' }, '待核对：' + text)),
            (layer.evidence || []).length > 0 && h('details', null, h('summary', null, '查看原文依据'), ...layer.evidence.map((evidence, index) => h('blockquote', { key: index }, h('small', null, evidence.locator), h('p', null, evidence.excerpt)))))),
          onUseProfile && h('div', { className: 'ap-row', style: { gap: 8, flexWrap: 'wrap', marginTop: 12 } }, button(selected ? '本次已按此范本' : useLabel, useProfile, !!selected), h('small', null, useHint)))))
  }
}
