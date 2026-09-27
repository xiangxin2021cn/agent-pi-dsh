import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, ROW_HEIGHT, planTime, taskRows, visibleTaskRows, timelineRange, taskGeometry, dependencyPaths, virtualWindow } from '../src/client/project-plan-model.js'
import { projectPlanLocales } from '../src/client/project-plan-locales.js'

const tasks = [
  { uid: 0, id: 0, name: '工程', level: 0, summary: true },
  { uid: 100, id: 1, name: '基础', level: 1, summary: true },
  { uid: 101, id: 2, name: '浇筑', level: 2, critical: true, start: '2026-09-22T08:00:00', finish: '2026-09-24T17:00:00', percent: 40 },
  { uid: 102, id: 3, name: '验收', level: 2, milestone: true, start: '2026-09-25T08:00:00', finish: '2026-09-25T08:00:00', predecessors: [{ uid: 101, type: 'FS' }] },
  { uid: 200, id: 4, name: '安装', level: 1, start: '2026-09-26T08:00:00', finish: '2026-10-01T17:00:00' },
]
test('folding preserves the task tree; search/filter retain ancestor context', () => {
  const rows = taskRows(tasks)
  assert.deepEqual(rows[2].parents, ['uid:0', 'uid:100'])
  assert.deepEqual(visibleTaskRows(rows, { collapsed: new Set(['uid:100']) }).map(row => row.uid), [0, 100, 200])
  assert.deepEqual(visibleTaskRows(rows, { collapsed: new Set(['uid:0']), query: '浇筑' }).map(row => row.uid), [0, 100, 101])
  assert.deepEqual(visibleTaskRows(rows, { filter: 'milestone' }).map(row => row.uid), [0, 100, 102])
  assert.deepEqual(visibleTaskRows(rows, { filter: 'critical' }).map(row => row.uid), [0, 100, 101])
  assert.deepEqual(visibleTaskRows(rows, { query: 'missing' }), [])
  assert.equal(tasks[0].key, undefined, 'view metadata never changes source tasks')
})
test('project-local dates and edited bars do not shift with browser time zone', () => {
  assert.equal(planTime('2026-09-22T08:00:00'), Date.UTC(2026, 8, 22, 8))
  assert.ok(Number.isNaN(planTime(null)))
  const rows = taskRows(tasks), range = timelineRange(rows, 'week', 700)
  const original = taskGeometry(rows[2], range)
  const edited = taskGeometry(taskRows(tasks, { 101: { start: '2026-09-23T08:00:00' } })[2], range)
  assert.equal(edited.left - original.left, range.pixelsPerDay)
  assert.equal(taskGeometry({ start: '2026-10-02', finish: '2026-10-01' }, range), null)
  assert.equal(timelineRange(taskRows([{ name: '未排期' }]), 'fit'), null)
  assert.ok(timelineRange(rows, 'fit', 700).width <= 700)
  assert.equal(planTime('2026-09-23T08:00:00') - planTime('2026-09-22T08:00:00'), DAY)
})
test('FS/SS/FF/SF links use unique IDs, correct endpoints and visible row positions', () => {
  const rows = taskRows(tasks), range = timelineRange(rows, 'week')
  const source = taskGeometry(rows[2], range), target = taskGeometry(rows[3], range)
  for (const type of ['FS', 'SS', 'FF', 'SF']) {
    const current = rows.map(row => row.uid === 102 ? { ...row, predecessors: [{ uid: 101, type }] } : row)
    const [link] = dependencyPaths(current, range, 0, 5)
    assert.equal(link.type, type)
    assert.ok(link.path.startsWith(`M${type[0] === 'F' ? source.right : source.left},${2 * ROW_HEIGHT + ROW_HEIGHT / 2}`))
    assert.ok(link.path.endsWith(`H${type[1] === 'F' ? target.right : target.left}`))
  }
  const filtered = rows.filter(row => row.uid !== 101)
  assert.equal(dependencyPaths(filtered, range, 0, 5).length, 0, 'hidden predecessors are not substituted by neighbouring rows')
  const withBlank = [{ uid: null, name: 'blank' }, ...rows]
  assert.match(dependencyPaths(withBlank, range, 0, 6)[0].path, /^M[^,]+,98 /)
})
test('800 and 20,000 task plans keep a bounded render window through the last row', () => {
  for (const count of [804, 20000]) {
    const { from, to } = virtualWindow(count, count * ROW_HEIGHT - 560, 560)
    assert.ok(to - from <= 36)
    assert.equal(to, count)
  }
})
test('all ten interface locales have complete professional schedule labels', () => {
  assert.equal(Object.keys(projectPlanLocales).length, 10)
  for (const [lang, dictionary] of Object.entries(projectPlanLocales)) {
    assert.deepEqual(Object.keys(dictionary), Object.keys(projectPlanLocales.en), lang)
    for (const [key, value] of Object.entries(dictionary)) assert.ok(typeof value === 'string' && value.trim(), `${lang}.${key}`)
  }
})
