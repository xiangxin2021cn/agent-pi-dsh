export function createProjectPlanPreview({ React, api }) {
  const h = React.createElement
  return function ProjectPlanPreview({ cwd, path, onEditState }) {
    const [plan, setPlan] = React.useState(null)
    const [error, setError] = React.useState('')
    const [status, setStatus] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [projectIndex, setProjectIndex] = React.useState(0)
    const [edits, setEdits] = React.useState({})
    const [savedEdits, setSavedEdits] = React.useState('{}')
    const dirty = JSON.stringify(edits) !== savedEdits
    React.useEffect(() => {
      onEditState?.({ dirty, busy })
      const warn = event => { event.preventDefault(); event.returnValue = '' }
      if (dirty || busy) window.addEventListener('beforeunload', warn)
      return () => window.removeEventListener('beforeunload', warn)
    }, [dirty, busy, onEditState])
    const [page, setPage] = React.useState(0)
    const [format, setFormat] = React.useState(/\.xer$/i.test(path) ? 'xer' : /\.pmxml$/i.test(path) ? 'pmxml' : 'mspdi')
    const [filename, setFilename] = React.useState(path.replaceAll('\\', '/').split('/').at(-1).replace(/\.[^.]+$/, '') + '-修订')
    React.useEffect(() => {
      const abort = new AbortController()
      api('/api/agent-pi/files/plan?path=' + encodeURIComponent(path), cwd, { signal: abort.signal })
        .then(value => { if (!abort.signal.aborted) setPlan(value) })
        .catch(error => { if (!abort.signal.aborted) setError(error.message) })
      return () => abort.abort()
    }, [cwd, path])
    const project = plan?.projects[projectIndex]
    const tasks = project?.tasks || []
    const range = React.useMemo(() => {
      const currentTasks = tasks.map(task => ({ ...task, ...edits[task.uid] }))
      const starts = currentTasks.map(task => Date.parse(task.start)).filter(Number.isFinite)
      const finishes = currentTasks.map(task => Date.parse(task.finish)).filter(Number.isFinite)
      const start = starts.reduce((a, b) => Math.min(a, b), Infinity)
      const finish = finishes.reduce((a, b) => Math.max(a, b), -Infinity)
      return { start, finish, span: Math.max(86400000, finish - start) }
    }, [tasks, edits])
    const exportPlan = async () => {
      setBusy(true); setError(''); setStatus('')
      try {
        const result = await api('/api/agent-pi/files/plan/export', cwd, { method: 'POST', body: JSON.stringify({
          path, revision: plan.revision, projectIndex, changes: Object.values(edits), format, filename,
        }) })
        setStatus(`已保存：${result.filename}。${result.warning}`)
        setSavedEdits(JSON.stringify(edits))
        window.dispatchEvent(new Event('agent-pi-files-changed'))
      } catch (error) { setError(error.message) } finally { setBusy(false) }
    }
    const field = (task, key, type = 'text') => h('input', {
      type, 'aria-label': `${task.name || task.uid} ${key}`, disabled: busy || task.uid == null,
      value: Object.hasOwn(edits[task.uid] || {}, key) ? edits[task.uid][key] ?? '' : task[key] ?? '',
      ...(type === 'number' ? { min: 0, max: 100, step: 1 } : {}),
      ...(type === 'datetime-local' ? { step: 1 } : {}),
      onChange: event => {
        const value = type === 'number' ? Number(event.target.value) : type === 'datetime-local' ? event.target.value || null : event.target.value
        setStatus(''); setEdits(previous => ({ ...previous, [task.uid]: { ...previous[task.uid], uid: task.uid, [key]: value } }))
      }, style: { width: key === 'name' ? 240 : type === 'number' ? 65 : 175, padding: 5 },
    })
    if (!plan) return h('p', { role: error ? 'alert' : 'status' }, error || '正在本机读取项目计划…')
    return h('section', { className: 'ap-project-plan', style: { padding: 16 } },
      h('p', null, '任务表与甘特图 · MPXJ 16.7.0'),
      h('p', null, '可修改名称、计划起止时间、工期完成率和备注，另存为新文件。工期完成率会更新剩余工期；不改实际日期，不自动重排计划。MPP 导出为 Project XML。'),
      h('label', null, '项目 ', h('select', { value: projectIndex, disabled: busy, onChange: event => {
        if (dirty && !window.confirm('切换项目将丢弃尚未导出的编辑，是否继续？')) return
        setProjectIndex(Number(event.target.value)); setEdits({}); setSavedEdits('{}'); setPage(0); setStatus('')
      } }, plan.projects.map((project, index) => h('option', { key: index, value: index }, project.name || `项目 ${index + 1}`)))),
      h('p', null, `${tasks.length} 项任务 · ${project?.calendarCount || 0} 个日历 · ${project?.resourceCount || 0} 项资源`),
      Number.isFinite(range.start) && Number.isFinite(range.finish)
        ? h('p', null, `甘特时间范围：${new Date(range.start).toLocaleDateString()} — ${new Date(range.finish).toLocaleDateString()}`) : null,
      h('div', { style: { overflow: 'auto', maxHeight: '56vh' } },
        h('table', { style: { borderCollapse: 'collapse', fontSize: 13, width: '100%' } },
          h('thead', null, h('tr', null, ['WBS / ID', '任务名称', '计划开始', '计划完成', '工期完成 %', '前置任务', '甘特图', '备注']
            .map(name => h('th', { key: name, style: { textAlign: 'left', padding: 8, whiteSpace: 'nowrap' } }, name)))),
          h('tbody', null, tasks.slice(page * 100, (page + 1) * 100).map((task, index) => {
            const current = { ...task, ...edits[task.uid] }
            const start = Date.parse(current.start), finish = Date.parse(current.finish)
            const left = Math.max(0, Math.min(99, 100 * (start - range.start) / range.span))
            const width = Math.max(1, Math.min(100 - left, 100 * (finish - start) / range.span))
            return h('tr', { key: task.uid ?? `row-${page}-${index}`, style: { borderTop: '1px solid #ddd' } },
              h('td', null, task.wbs || task.activityId || task.id),
              h('td', { style: { paddingLeft: Math.min(5, task.level || 0) * 8 } }, field(task, 'name')),
              h('td', null, field(task, 'start', 'datetime-local')), h('td', null, field(task, 'finish', 'datetime-local')),
              h('td', null, field(task, 'percent', 'number')),
              h('td', null, task.predecessors.map(link => `${link.uid} ${link.type} ${link.lag || ''}`).join(', ')),
              h('td', { style: { minWidth: 220 }, title: `${current.start || ''} → ${current.finish || ''}` },
                Number.isFinite(start) && Number.isFinite(finish) && Number.isFinite(range.start)
                  ? h('div', { style: { position: 'relative', width: 220, height: 18, background: '#edf2f6' } },
                    h('div', { style: { position: 'absolute', left: left + '%', width: width + '%', height: 14, top: 2,
                      borderRadius: 3, background: task.critical ? '#d97848' : '#1397a8' } })) : '无日期'),
              h('td', null, field(task, 'notes')),
            )
          })))),
      h('div', { style: { display: 'flex', gap: 12, padding: '12px 0', alignItems: 'center', flexWrap: 'wrap' } },
        h('button', { type: 'button', disabled: page === 0, onClick: () => setPage(value => value - 1) }, '上一页'),
        h('span', null, `${page + 1} / ${Math.max(1, Math.ceil(tasks.length / 100))}`),
        h('button', { type: 'button', disabled: (page + 1) * 100 >= tasks.length, onClick: () => setPage(value => value + 1) }, '下一页'),
        h('label', null, '导出格式 ', h('select', { value: format, disabled: busy, onChange: event => setFormat(event.target.value) },
          h('option', { value: 'mspdi' }, 'Project XML（当前项目）'),
          h('option', { value: 'pmxml' }, 'P6 XML（全部项目）'), h('option', { value: 'xer' }, 'P6 XER（全部项目，UTF-8）'))),
        h('label', null, '新文件名 ', h('input', { value: filename, disabled: busy, onChange: event => setFilename(event.target.value) })),
        h('button', { type: 'button', disabled: busy, onClick: exportPlan }, busy ? '正在导出并校验…' : '另存并校验'),
        h('button', { type: 'button', disabled: busy, onClick: () => { setEdits({}); setStatus('') } }, '撤销编辑'),
      ),
      error ? h('p', { role: 'alert', style: { color: '#c33636' } }, error) : null,
      status ? h('p', { role: 'status' }, status) : null,
    )
  }
}
