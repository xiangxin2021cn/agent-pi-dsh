export function createKnowledgeVersionPanel({ React, api }) {
  const h = React.createElement
  return function KnowledgeVersionPanel({ cwd, entry, onChanged }) {
    const [versions, setVersions] = React.useState([])
    const [error, setError] = React.useState('')
    const [open, setOpen] = React.useState(false)
    const [draft, setDraft] = React.useState({ sourceKind: entry.sourceKind || 'original', regions: (entry.regions || []).join(', '), validFrom: entry.validFrom || '', validUntil: entry.validUntil || '', derivedFrom: (entry.derivedFrom || []).join('\n') })
    const post = body => api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify({ slug: entry.slug, ...body }) })
    const load = () => post({ action: 'versions' }).then(body => setVersions(body.versions || [])).catch(e => setError(e.message))
    React.useEffect(() => { if (open) void load() }, [open, cwd, entry.slug, entry.versionId])
    const field = (key, label, type = 'text') => h('label', { key, className: 'ap-mm-field' }, label, h('input', { type, value: draft[key], onChange: e => setDraft({ ...draft, [key]: e.target.value }) }))
    const save = () => {
      setError('')
      return post({ action: 'metadata', metadata: { sourceKind: draft.sourceKind, regions: draft.regions.split(/[,，]/).map(s => s.trim()).filter(Boolean), validFrom: draft.validFrom, validUntil: draft.validUntil, derivedFrom: draft.derivedFrom.split('\n').map(s => s.trim()).filter(Boolean) } })
        .then(() => { onChanged?.(); return load() }).catch(e => setError(e.message))
    }
    return h('details', { className: 'ap-sec', onToggle: e => setOpen(e.currentTarget.open) }, h('summary', null, '来源与不可变版本'),
      h('p', { className: 'ap-sub' }, '已登记的地区和有效期参与适用性检查；缺少项目地区时，不能确认限定地区的来源。生成内容不能作为自身的独立依据。更正元数据会生成新版本，旧引用继续定位旧版本。'),
      error ? h('p', { className: 'ap-err' }, error) : null,
      h('div', { className: 'ap-row', style: { flexWrap: 'wrap' } },
        h('label', { className: 'ap-mm-field' }, '来源属性', h('select', { value: draft.sourceKind, onChange: e => setDraft({ ...draft, sourceKind: e.target.value }) }, ['original', 'parsed', 'generated'].map((value, index) => h('option', { key: value, value }, ['原始材料', '解析稿', '生成内容'][index])))),
        field('regions', '适用地区（逗号分隔）'), field('validFrom', '生效日期', 'date'), field('validUntil', '失效日期', 'date')),
      h('label', { className: 'ap-mm-field' }, '解析稿的原始版本引用（每行一个）', h('textarea', { value: draft.derivedFrom, onChange: e => setDraft({ ...draft, derivedFrom: e.target.value }) })),
      h('button', { className: 'ap-btn', type: 'button', onClick: save }, '按真实材料确认来源及适用条件'),
      versions.map(version => h('div', { key: version.versionId, className: 'ap-sub', style: { overflowWrap: 'anywhere', marginTop: 8 } }, 'v' + version.versionId + ' · ' + version.createdAt + ' · 原件 ' + (version.originalHash || '未单独登记') + ' · 正文 ' + version.manuscriptHash)),
    )
  }
}
