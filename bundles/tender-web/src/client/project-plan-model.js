export const DAY = 86400000
export const ROW_HEIGHT = 28

// MPXJ supplies project-local civil times, not browser-local instants.
export function planTime(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value || '')
  return parts ? Date.UTC(+parts[1], +parts[2] - 1, +parts[3], +(parts[4] || 0), +(parts[5] || 0), +(parts[6] || 0)) : NaN
}

export function taskRows(tasks, edits = {}) {
  const stack = []
  return tasks.map((task, index) => {
    const level = Math.max(0, Number(task.level) || 0)
    while (stack.length && stack.at(-1).level >= level) stack.pop()
    const row = { ...task, ...edits[task.uid], key: task.uid == null ? `row:${index}` : `uid:${task.uid}`,
      sourceIndex: index, level, parents: stack.map(parent => parent.key),
      hasChildren: index + 1 < tasks.length && (Number(tasks[index + 1].level) || 0) > level }
    stack.push(row)
    return row
  })
}

export function visibleTaskRows(rows, { collapsed = new Set(), query = '', filter = 'all' } = {}) {
  const text = query.trim().toLocaleLowerCase()
  if (!text && filter === 'all') return rows.filter(row => !row.parents.some(key => collapsed.has(key)))
  const keep = new Set()
  for (const row of rows) {
    const matches = (!text || [row.name, row.wbs, row.activityId, row.id].join(' ').toLocaleLowerCase().includes(text)) &&
      (filter === 'all' || filter === 'critical' && row.critical || filter === 'milestone' && row.milestone ||
        filter === 'incomplete' && !row.summary && Number(row.percent || 0) < 100)
    if (matches) { keep.add(row.key); row.parents.forEach(key => keep.add(key)) }
  }
  return rows.filter(row => keep.has(row.key))
}

export function timelineRange(rows, scale, viewport = 700) {
  let start = Infinity, finish = -Infinity
  for (const row of rows) {
    const a = planTime(row.start), b = planTime(row.finish)
    if (Number.isFinite(a)) { start = Math.min(start, a); finish = Math.max(finish, a) }
    if (Number.isFinite(b)) { start = Math.min(start, b); finish = Math.max(finish, b) }
  }
  if (!Number.isFinite(start)) return null
  start = Math.floor(start / DAY) * DAY - 2 * DAY
  finish = Math.ceil(finish / DAY) * DAY + 3 * DAY
  const span = Math.max(7 * DAY, finish - start)
  const pixelsPerDay = scale === 'day' ? 36 : scale === 'month' ? 4 : scale === 'fit' ? Math.max(.02, (viewport - 24) / (span / DAY)) : 12
  return { start, finish: start + span, pixelsPerDay, width: Math.max(viewport, Math.ceil(span / DAY * pixelsPerDay)),
    x: time => (time - start) / DAY * pixelsPerDay }
}

export function timelineTicks(range, scale) {
  if (!range) return { months: [], units: [] }
  const months = [], units = []
  const date = new Date(range.start)
  let month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  while (month < range.finish) {
    const d = new Date(month), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    months.push({ start: Math.max(range.start, month), end: Math.min(range.finish, next), date: month })
    month = next
  }
  // Keep the ruler bounded even for schedules spanning decades.
  const step = scale === 'day' ? 1 : Math.max(7, Math.ceil(50 / (range.pixelsPerDay * 7)) * 7)
  let unit = range.start
  if (step % 7 === 0) unit -= ((new Date(unit).getUTCDay() + 6) % 7) * DAY
  while (unit < range.finish && units.length < 2000) {
    units.push({ start: Math.max(range.start, unit), end: Math.min(range.finish, unit + step * DAY), date: unit })
    unit += step * DAY
  }
  return { months, units }
}

export function taskGeometry(row, range) {
  if (!range) return null
  const start = planTime(row.start), finish = planTime(row.finish)
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return null
  const left = range.x(start), right = range.x(finish)
  return { left, right, width: Math.max(row.milestone ? 0 : 3, right - left) }
}

export function relationCode(type) {
  const normalized = String(type || '').toUpperCase().replaceAll('_', ' ')
  return ({ 'FINISH-START': 'FS', 'FINISH-FINISH': 'FF', 'START-START': 'SS', 'START-FINISH': 'SF',
    'FINISH TO START': 'FS', 'FINISH TO FINISH': 'FF', 'START TO START': 'SS', 'START TO FINISH': 'SF' })[normalized] ||
    (['FS', 'FF', 'SS', 'SF'].includes(normalized) ? normalized : null)
}

export function dependencyPaths(rows, range, from, to) {
  const byUid = new Map(rows.map((row, index) => [String(row.uid), { row, index }]).filter(([, value]) => value.row.uid != null))
  const links = []
  rows.forEach((row, index) => {
    const target = taskGeometry(row, range)
    if (!target) return
    for (const link of row.predecessors || []) {
      const source = byUid.get(String(link.uid)), type = relationCode(link.type)
      if (!source || !type || index < from && source.index < from || index >= to && source.index >= to) continue
      const origin = taskGeometry(source.row, range)
      if (!origin) continue
      const x1 = type[0] === 'F' ? origin.right : origin.left, x2 = type[1] === 'F' ? target.right : target.left
      const y1 = source.index * ROW_HEIGHT + ROW_HEIGHT / 2, y2 = index * ROW_HEIGHT + ROW_HEIGHT / 2
      const out = x1 + (type[0] === 'F' ? 8 : -8), into = x2 + (type[1] === 'F' ? 8 : -8)
      const middle = y2 + (y1 > y2 ? ROW_HEIGHT / 2 - 3 : -ROW_HEIGHT / 2 + 3)
      links.push({ key: `${row.key}:${source.row.key}:${links.length}`, targetKey: row.key, sourceKey: source.row.key, type,
        path: `M${x1},${y1} H${out} V${middle} H${into} V${y2} H${x2}` })
    }
  })
  return links
}

export function virtualWindow(count, scrollTop, height) {
  const from = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 8)
  return { from, to: Math.min(count, from + Math.ceil(height / ROW_HEIGHT) + 16) }
}
