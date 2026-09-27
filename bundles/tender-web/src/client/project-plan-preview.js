import { ROW_HEIGHT, taskRows, visibleTaskRows, timelineRange, timelineTicks, taskGeometry, dependencyPaths, relationCode, virtualWindow } from './project-plan-model.js'
import { projectPlanCss } from './project-plan-styles.js'
import { planTranslator } from './project-plan-locales.js'

const EMPTY_TASKS = []
export function createProjectPlanPreview({ React, api, Icon, useApLang }) {
  const h = React.createElement
  const icon = (name, size = 14) => {
    if (name === 'chevronRight' || name === 'chevronDown' || name === 'undo' || name === 'redo') {
      const d = name === 'chevronRight' ? 'm9 6 6 6-6 6' : name === 'chevronDown' ? 'm6 9 6 6 6-6' : 'M3 10h10a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5'
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        'aria-hidden': true, style: name === 'redo' ? { transform: 'scaleX(-1)' } : undefined }, h('path', { d, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }
    return Icon ? Icon(name, size) : null
  }
  return function ProjectPlanPreview({ cwd, path, onEditState }) {
    const lang = useApLang ? useApLang() : 'zh', t = planTranslator(lang)
    const [plan, setPlan] = React.useState(null)
    const [error, setError] = React.useState(''), [status, setStatus] = React.useState('')
    const [busy, setBusy] = React.useState(false), [projectIndex, setProjectIndex] = React.useState(0)
    const [history, setHistory] = React.useState({ past: [], present: {}, future: [] })
    const edits = history.present
    const [savedEdits, setSavedEdits] = React.useState('{}'), dirty = JSON.stringify(edits) !== savedEdits
    const [selectedKey, setSelectedKey] = React.useState(null), [collapsed, setCollapsed] = React.useState(new Set())
    const [query, setQuery] = React.useState(''), [filter, setFilter] = React.useState('all'), [scale, setScale] = React.useState('week')
    const [showLinks, setShowLinks] = React.useState(true), [showDetails, setShowDetails] = React.useState(true)
    const [exportOpen, setExportOpen] = React.useState(false), [inlineKey, setInlineKey] = React.useState(null)
    const [inlineName, setInlineName] = React.useState('')
    const [format, setFormat] = React.useState(/\.xer$/i.test(path) ? 'xer' : /\.pmxml$/i.test(path) ? 'pmxml' : 'mspdi')
    const [filename, setFilename] = React.useState(path.replaceAll('\\', '/').split('/').at(-1).replace(/\.[^.]+$/, '') + '-revision')
    const [viewport, setViewport] = React.useState({ height: 500, width: 700 })
    const [scroll, setScroll] = React.useState({ top: 0, tableLeft: 0, chartLeft: 0 }), [split, setSplit] = React.useState(52)
    const [mobilePane, setMobilePane] = React.useState('table')
    const tableRef = React.useRef(null), chartRef = React.useRef(null), splitRef = React.useRef(null), dragRef = React.useRef(null)
    const markerId = 'plan-arrow-' + React.useId().replace(/[^a-z0-9]/gi, '')
    React.useEffect(() => {
      onEditState?.({ dirty, busy })
      const warn = event => { event.preventDefault(); event.returnValue = '' }
      if (dirty || busy) window.addEventListener('beforeunload', warn)
      return () => window.removeEventListener('beforeunload', warn)
    }, [dirty, busy, onEditState])
    React.useEffect(() => {
      const abort = new AbortController()
      api('/api/agent-pi/files/plan?path=' + encodeURIComponent(path), cwd, { signal: abort.signal })
        .then(value => { if (!abort.signal.aborted) setPlan(value) })
        .catch(error => { if (!abort.signal.aborted) setError(error.message) })
      return () => abort.abort()
    }, [cwd, path])
    React.useEffect(() => {
      const node = chartRef.current
      if (!node) return
      const update = () => setViewport({ height: Math.max(node.clientHeight, tableRef.current?.clientHeight || 0),
        width: node.clientWidth || splitRef.current?.clientWidth || 700 })
      const observer = new ResizeObserver(update)
      observer.observe(node)
      if (tableRef.current) observer.observe(tableRef.current)
      update()
      for (const pane of [tableRef.current, chartRef.current]) if (pane?.clientHeight) pane.scrollTop = scroll.top
      return () => observer.disconnect()
    }, [plan, showDetails, exportOpen, mobilePane])
    const tasks = plan?.projects[projectIndex]?.tasks || EMPTY_TASKS
    const rows = React.useMemo(() => taskRows(tasks, edits), [tasks, edits])
    const rowByKey = React.useMemo(() => new Map(rows.map(row => [row.key, row])), [rows])
    const rowByUid = React.useMemo(() => new Map(rows.filter(row => row.uid != null).map(row => [String(row.uid), row])), [rows])
    const visible = React.useMemo(() => visibleTaskRows(rows, { collapsed, query, filter }), [rows, collapsed, query, filter])
    const visibleIndex = React.useMemo(() => new Map(visible.map((row, index) => [row.key, index])), [visible])
    const selected = rowByKey.get(selectedKey) || null
    const range = React.useMemo(() => timelineRange(rows, scale, viewport.width), [rows, scale, viewport.width])
    const ticks = React.useMemo(() => timelineTicks(range, scale), [range, scale])
    const windowRows = virtualWindow(visible.length, scroll.top, viewport.height)
    const links = React.useMemo(() => showLinks ? dependencyPaths(visible, range, windowRows.from, windowRows.to) : [],
      [visible, range, windowRows.from, windowRows.to, showLinks])
    const dateText = value => value ? String(value).slice(0, 10).replaceAll('-', '/') : '—'
    const tickText = (value, month = false) => new Intl.DateTimeFormat(lang, { timeZone: 'UTC',
      ...(month ? { year: 'numeric', month: 'short' } : { month: 'numeric', day: 'numeric' }) }).format(new Date(value))
    const dependencyText = row => (row.predecessors || []).map(link => {
      const predecessor = rowByUid.get(String(link.uid))
      return `${predecessor?.id ?? link.uid}${relationCode(link.type) || link.type || ''}${link.lag && !/^0(?:\.0+)?\D/.test(link.lag) ? ' ' + link.lag : ''}`
    }).join(', ')
    const synchronize = (side, node) => {
      const other = side === 'table' ? chartRef.current : tableRef.current
      if (other && Math.abs(other.scrollTop - node.scrollTop) > 1) other.scrollTop = node.scrollTop
      setScroll(previous => ({ ...previous, top: node.scrollTop, [side === 'table' ? 'tableLeft' : 'chartLeft']: node.scrollLeft }))
    }
    React.useEffect(() => {
      for (const node of [tableRef.current, chartRef.current]) if (node) node.scrollTop = 0
      setScroll(previous => ({ ...previous, top: 0 }))
    }, [query, filter, collapsed, projectIndex])
    const selectTask = (row, locate = false) => {
      if (!row) return
      setSelectedKey(row.key)
      if (!locate) return
      setQuery(''); setFilter('all')
      const expanded = new Set(collapsed)
      row.parents.forEach(key => expanded.delete(key)); setCollapsed(expanded)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const index = visibleTaskRows(rows, { collapsed: expanded }).findIndex(item => item.key === row.key)
        const top = Math.max(0, index * ROW_HEIGHT - viewport.height / 3)
        for (const node of [tableRef.current, chartRef.current]) if (node) node.scrollTop = top
        const shape = taskGeometry(row, range)
        if (shape && chartRef.current) chartRef.current.scrollLeft = Math.max(0, shape.left - viewport.width / 3)
      }))
    }
    const toggle = row => setCollapsed(previous => {
      const next = new Set(previous)
      if (next.has(row.key)) next.delete(row.key); else next.add(row.key)
      return next
    })
    const change = (row, key, value) => {
      if (busy || row.uid == null) return
      setStatus('')
      setHistory(previous => {
        if ((previous.present[row.uid]?.[key] ?? row[key] ?? '') === (value ?? '')) return previous
        const next = { ...previous.present, [row.uid]: { ...previous.present[row.uid], uid: row.uid, [key]: value } }
        if ((tasks[row.sourceIndex]?.[key] ?? '') === (value ?? '')) {
          delete next[row.uid][key]
          if (Object.keys(next[row.uid]).length === 1) delete next[row.uid]
        }
        return { past: [...previous.past.slice(-79), previous.present], present: next, future: [] }
      })
    }
    const undo = () => { setStatus(''); setHistory(previous => previous.past.length ? {
      past: previous.past.slice(0, -1), present: previous.past.at(-1), future: [previous.present, ...previous.future],
    } : previous) }
    const redo = () => { setStatus(''); setHistory(previous => previous.future.length ? {
      past: [...previous.past, previous.present], present: previous.future[0], future: previous.future.slice(1),
    } : previous) }
    const exportPlan = async () => {
      setBusy(true); setError(''); setStatus('')
      try {
        const result = await api('/api/agent-pi/files/plan/export', cwd, { method: 'POST', body: JSON.stringify({
          path, revision: plan.revision, projectIndex, changes: Object.values(edits), format, filename,
        }) })
        setStatus({ filename: result.filename })
        setSavedEdits(JSON.stringify(edits)); setExportOpen(false)
        window.dispatchEvent(new Event('agent-pi-files-changed'))
      } catch (error) { setError(error.message) } finally { setBusy(false) }
    }
    const control = (label, handler, disabled = false, symbol, extra = {}) => h('button', {
      type: 'button', title: label, onClick: handler, disabled, ...extra,
    }, symbol ? icon(symbol) : null, label)
    const field = (row, key, label, type = 'text') => h('label', { className: key === 'name' ? 'name' : undefined }, t(label),
      h(key === 'notes' ? 'textarea' : 'input', { type: key === 'notes' ? undefined : type,
        'aria-label': t(label), disabled: busy || row.uid == null, value: row[key] ?? '',
        ...(type === 'number' ? { min: 0, max: 100, step: 1 } : {}), ...(type === 'datetime-local' ? { step: 1 } : {}),
        onChange: event => change(row, key, type === 'number' ? Number(event.target.value) : event.target.value || (type === 'datetime-local' ? null : '')),
      }))
    const moveSelection = (event, row) => {
      if (event.target.tagName === 'INPUT') return
      const index = visibleIndex.get(row.key)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
        selectTask(next)
        const node = tableRef.current, targetIndex = visibleIndex.get(next.key)
        if (node && (targetIndex * ROW_HEIGHT < node.scrollTop || (targetIndex + 1) * ROW_HEIGHT > node.scrollTop + node.clientHeight))
          node.scrollTop = Math.max(0, targetIndex * ROW_HEIGHT - node.clientHeight / 2)
        requestAnimationFrame(() => tableRef.current?.querySelector(`[data-index="${targetIndex}"]`)?.focus({ preventScroll: true }))
      } else if (event.key === 'ArrowLeft' && row.hasChildren && !collapsed.has(row.key) ||
                 event.key === 'ArrowRight' && row.hasChildren && collapsed.has(row.key)) {
        event.preventDefault(); toggle(row)
      } else if (event.key === 'Enter') { event.preventDefault(); setShowDetails(true); selectTask(row) }
    }
    const rowContent = (row, index) => h('div', { key: row.key, role: 'row', 'aria-rowindex': index + 2,
      'aria-selected': selectedKey === row.key, 'aria-expanded': row.hasChildren ? !collapsed.has(row.key) : undefined,
      'data-index': index, className: 'ap-plan-task-row' + (selectedKey === row.key ? ' selected' : '') + (row.summary ? ' summary' : ''),
      style: { top: index * ROW_HEIGHT }, tabIndex: selectedKey === row.key || !selectedKey && index === 0 ? 0 : -1,
      onClick: () => selectTask(row), onKeyDown: event => moveSelection(event, row),
    }, h('div', { role: 'gridcell', className: 'ap-plan-cell row-number' }, row.id ?? row.sourceIndex + 1),
      h('div', { role: 'gridcell', className: 'ap-plan-cell', title: row.wbs || row.activityId || '' }, row.wbs || row.activityId || '—'),
      h('div', { role: 'gridcell', className: 'ap-plan-cell task-name', style: { paddingLeft: 6 + Math.min(12, row.parents.length) * 14 }, title: row.name || '',
        onDoubleClick: () => { if (!busy && row.uid != null) { setInlineKey(row.key); setInlineName(row.name || '') } },
      }, row.hasChildren ? h('button', { type: 'button', 'aria-label': (collapsed.has(row.key) ? t('expand') : t('collapse')) + ': ' + row.name,
        onClick: event => { event.stopPropagation(); toggle(row) } }, icon(collapsed.has(row.key) ? 'chevronRight' : 'chevronDown', 12)) : h('i', { className: 'ap-plan-caret-space' }),
        inlineKey === row.key ? h('input', { autoFocus: true, value: inlineName, 'aria-label': t('name'),
          onChange: event => setInlineName(event.target.value), onClick: event => event.stopPropagation(),
          onBlur: () => { change(row, 'name', inlineName); setInlineKey(null) },
          onKeyDown: event => { if (event.key === 'Enter') event.target.blur(); if (event.key === 'Escape') setInlineKey(null) },
        }) : h('span', null, row.name || '—'),
        edits[row.uid] ? h('i', { className: 'ap-plan-modified', title: t('changed') }, '•') : null),
      ...[row.duration || '—', dateText(row.start), dateText(row.finish), `${Number(row.percent || 0).toFixed(0)}%`, dependencyText(row) || '—']
        .map((value, i) => h('div', { key: i, role: 'gridcell', className: 'ap-plan-cell', title: String(value) }, value)))
    if (!plan) return h('div', { className: 'ap-plan' }, h('style', null, projectPlanCss),
      h('div', { className: 'ap-plan-empty', role: error ? 'alert' : 'status' }, error || t('loading')))
    const project = plan.projects[projectIndex], today = new Date()
    const todayX = range?.x(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    return h('section', { className: 'ap-plan', 'aria-label': t('title'), dir: lang === 'ar' ? 'rtl' : 'ltr',
      onKeyDown: event => {
        if (!busy && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
          event.preventDefault(); if (event.shiftKey) redo(); else undo()
        }
      },
    }, h('style', null, projectPlanCss),
      h('div', { className: 'ap-plan-toolbar' }, h('strong', null, t('title')),
        h('select', { className: 'ap-plan-project', 'aria-label': t('title'), value: projectIndex, disabled: busy,
          onChange: event => {
            if (dirty && !window.confirm(t('switch'))) return
            setProjectIndex(Number(event.target.value)); setHistory({ past: [], present: {}, future: [] }); setSavedEdits('{}')
            setCollapsed(new Set()); setSelectedKey(null); setInlineKey(null); setStatus(''); setError(''); setQuery(''); setFilter('all')
          },
        }, plan.projects.map((item, index) => h('option', { key: index, value: index }, item.name || `${t('title')} ${index + 1}`))),
        h('input', { className: 'ap-plan-search', type: 'search', placeholder: t('search'), 'aria-label': t('search'), value: query, onChange: event => setQuery(event.target.value) }),
        h('select', { 'aria-label': t('tasks'), value: filter, onChange: event => setFilter(event.target.value) },
          ['all', 'critical', 'milestone', 'incomplete'].map(value => h('option', { key: value, value }, t(value)))),
        h('select', { className: 'ap-plan-mobile-view', 'aria-label': t('view'), value: mobilePane, onChange: event => setMobilePane(event.target.value) },
          h('option', { value: 'table' }, t('tasks')), h('option', { value: 'chart' }, t('gantt'))),
        h('div', { className: 'ap-plan-tools' },
          control(t('expand'), () => setCollapsed(new Set()), false, 'chevronDown'),
          control(t('collapse'), () => setCollapsed(new Set(rows.filter(row => row.hasChildren).map(row => row.key))), false, 'chevronRight'),
          h('select', { 'aria-label': t('scale'), value: scale, onChange: event => { setScale(event.target.value); if (chartRef.current) chartRef.current.scrollLeft = 0 } },
            ['day', 'week', 'month', 'fit'].map(value => h('option', { key: value, value }, t(value)))),
          control(t('locate'), () => selectTask(selected, true), !selected || !taskGeometry(selected, range), 'search'),
          control(t('today'), () => { if (chartRef.current) chartRef.current.scrollLeft = Math.max(0, todayX - viewport.width / 2) }, !range || todayX < 0 || todayX > range.width),
          h('label', null, h('input', { type: 'checkbox', checked: showLinks, onChange: event => setShowLinks(event.target.checked) }), t('links')),
          control(t('details'), () => setShowDetails(value => !value), false, undefined, { 'aria-pressed': showDetails }),
          control(t('undo'), undo, busy || !history.past.length, 'undo'), control(t('redo'), redo, busy || !history.future.length, 'redo'),
          control(t('save'), () => setExportOpen(value => !value), busy, 'save', { className: 'primary', 'aria-expanded': exportOpen }))),
      exportOpen ? h('div', { className: 'ap-plan-export' },
        h('label', null, t('format'), h('select', { value: format, disabled: busy, onChange: event => setFormat(event.target.value) },
          h('option', { value: 'mspdi' }, 'Project XML'), h('option', { value: 'pmxml' }, 'P6 XML'), h('option', { value: 'xer' }, 'P6 XER · UTF-8'))),
        h('label', null, t('filename'), h('input', { value: filename, disabled: busy, onChange: event => setFilename(event.target.value) })),
        control(busy ? t('saving') : t('export'), exportPlan, busy || !filename.trim(), 'save', { className: 'primary' }), control(t('cancel'), () => setExportOpen(false), busy)) : null,
      error ? h('div', { className: 'ap-plan-message error', role: 'alert' }, error) : null,
      status ? h('div', { className: 'ap-plan-message success', role: 'status' }, `${t('saved')}: ${status.filename}. ${t('exportWarning')}`) : null,
      h('div', { className: `ap-plan-split ${mobilePane}-view`, ref: splitRef, style: { '--ap-plan-table': `${split}%` } },
        h('div', { className: 'ap-plan-pane' },
          h('div', { className: 'ap-plan-header' }, h('div', { className: 'ap-plan-grid-head', role: 'row', style: { transform: `translateX(${-scroll.tableLeft}px)` } },
            ['ID', 'WBS', t('name'), t('duration'), t('start'), t('finish'), t('percent'), t('predecessors')].map(label => h('div', { key: label, role: 'columnheader', title: label }, label)))),
          h('div', { className: 'ap-plan-scroll', ref: tableRef, onScroll: event => synchronize('table', event.currentTarget) },
            h('div', { className: 'ap-plan-grid-content', role: 'grid', 'aria-label': t('tasks'), 'aria-rowcount': visible.length + 1, style: { height: visible.length * ROW_HEIGHT } },
              visible.slice(windowRows.from, windowRows.to).map((row, offset) => rowContent(row, windowRows.from + offset)),
              !visible.length ? h('div', { className: 'ap-plan-empty' }, t('empty')) : null))),
        h('div', { className: 'ap-plan-divider', role: 'separator', tabIndex: 0, 'aria-label': t('title'), 'aria-orientation': 'vertical',
          'aria-valuenow': split, 'aria-valuemin': 25, 'aria-valuemax': 75,
          onPointerDown: event => { dragRef.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId) },
          onPointerMove: event => { if (dragRef.current !== event.pointerId) return; const rect = splitRef.current.getBoundingClientRect(); setSplit(Math.max(25, Math.min(75, (event.clientX - rect.left) / rect.width * 100))) },
          onPointerUp: () => { dragRef.current = null }, onPointerCancel: () => { dragRef.current = null },
          onKeyDown: event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSplit(value => Math.max(25, Math.min(75, value + (event.key === 'ArrowLeft' ? -2 : 2)))) } }}),
        h('div', { className: 'ap-plan-pane' },
          h('div', { className: 'ap-plan-header' }, h('div', { className: 'ap-plan-ruler', style: { width: range?.width || '100%', transform: `translateX(${-scroll.chartLeft}px)` } },
            ...ticks.months.map(tick => h('div', { key: `m:${tick.date}`, className: 'ap-plan-ruler-cell', style: { left: range.x(tick.start), width: range.x(tick.end) - range.x(tick.start) } }, tickText(tick.date, true))),
            ...ticks.units.map(tick => h('div', { key: `u:${tick.date}`, className: 'ap-plan-ruler-cell unit', style: { left: range.x(tick.start), width: range.x(tick.end) - range.x(tick.start) } }, tickText(tick.date))))),
          h('div', { className: 'ap-plan-scroll', ref: chartRef, onScroll: event => synchronize('chart', event.currentTarget) },
            h('div', { className: 'ap-plan-chart-content', style: { width: range?.width || '100%', height: visible.length * ROW_HEIGHT } },
              h('div', { className: 'ap-plan-chart-grid' }, ticks.units.map(tick => h('i', { key: tick.date, className: 'ap-plan-tick', style: { left: range.x(tick.start) } }))),
              visible.slice(windowRows.from, windowRows.to).map((row, offset) => {
                const index = windowRows.from + offset, shape = taskGeometry(row, range)
                return h('div', { key: row.key, className: 'ap-plan-chart-row' + (selectedKey === row.key ? ' selected' : ''), style: { top: index * ROW_HEIGHT }, onClick: () => selectTask(row) },
                  shape ? h('button', { type: 'button', className: 'ap-plan-bar' + (row.summary ? ' summary' : row.milestone ? ' milestone' : '') + (row.critical ? ' critical' : '') + (selectedKey === row.key ? ' selected' : ''),
                    style: { left: shape.left, width: shape.width }, 'aria-label': row.name || String(row.uid), title: `${row.name}\n${dateText(row.start)} → ${dateText(row.finish)} · ${Number(row.percent || 0)}%`,
                    onClick: event => { event.stopPropagation(); selectTask(row) } },
                  !row.summary && !row.milestone ? h('span', { className: 'ap-plan-progress', style: { width: `${Math.max(0, Math.min(100, Number(row.percent || 0)))}%` } }) : null) : null)
              }),
              range && showLinks ? h('svg', { className: 'ap-plan-links', width: range.width, height: visible.length * ROW_HEIGHT, 'aria-hidden': true },
                h('defs', null, h('marker', { id: markerId, viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, h('path', { d: 'M0,0 L6,3 L0,6 Z', fill: '#6592b8' }))),
                links.map(link => h('path', { key: link.key, d: link.path, fill: 'none', stroke: selectedKey === link.targetKey || selectedKey === link.sourceKey ? '#217ac0' : '#94b9d8',
                  strokeWidth: selectedKey === link.targetKey || selectedKey === link.sourceKey ? 1.5 : 1, markerEnd: `url(#${markerId})` }))) : null,
              range && todayX >= 0 && todayX <= range.width ? h('div', { className: 'ap-plan-today', style: { left: todayX } }, h('span', null, t('today'))) : null,
              !range ? h('div', { className: 'ap-plan-empty' }, t('noDates')) : null)))),
      showDetails ? selected ? h('div', { className: 'ap-plan-inspector' },
        h('div', { className: 'ap-plan-detail-fields' }, field(selected, 'name', 'name'), field(selected, 'start', 'start', 'datetime-local'), field(selected, 'finish', 'finish', 'datetime-local'), field(selected, 'percent', 'percent', 'number')),
        h('div', { className: 'ap-plan-detail-read' }, h('div', null, h('span', null, `${t('resources')} · ${t('readonly')}`), selected.resources || '—'),
          h('div', null, h('span', null, `${t('predecessors')} · ${t('readonly')}`), (selected.predecessors || []).length ? selected.predecessors.map((link, index) => {
            const row = rowByUid.get(String(link.uid))
            return h('button', { key: index, type: 'button', disabled: !row, title: row?.name || '', onClick: () => selectTask(row, true) }, `${row?.id ?? link.uid}${relationCode(link.type) || link.type || ''} ${link.lag || ''}`)
          }) : '—'), h('div', null, h('span', null, t('duration')), selected.duration || '—')),
        field(selected, 'notes', 'notes')) : h('div', { className: 'ap-plan-help' }, t('select')) : null,
      h('div', { className: 'ap-plan-footer' }, `${t('tasks')}: ${tasks.length}`, `${t('visible')}: ${visible.length}`, `${t('calendars')}: ${project.calendarCount || 0}`,
        Object.keys(edits).length ? `${t('changed')}: ${Object.keys(edits).length}${dirty ? ' *' : ''}` : t('original'),
        control(t('reset'), () => { setHistory({ past: [...history.past, edits], present: {}, future: [] }); setStatus('') }, busy || !Object.keys(edits).length), t('manual'),
        h('span', { className: 'ap-plan-legend' }, ...['all', 'critical', 'milestone'].map(key => h('span', { key }, h('i', { className: key }), t(key))))),
      h('details', { className: 'ap-plan-help' }, h('summary', null, plan.engine || 'MPXJ'), t('help')))
  }
}
