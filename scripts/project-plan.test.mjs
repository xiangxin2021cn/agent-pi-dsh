import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProjectPlan, exportProjectPlan } from '../bundles/tender-host/src/project-plan.mjs'

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
<Name>工程测试</Name><Title>工程测试</Title><StartDate>2026-09-22T08:00:00</StartDate><CalendarUID>1</CalendarUID>
<Calendars><Calendar><UID>1</UID><Name>标准日历</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays><WeekDay><DayType>1</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay><WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay><WeekDay><DayType>3</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay><WeekDay><DayType>4</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay><WeekDay><DayType>5</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay><WeekDay><DayType>6</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay><WeekDay><DayType>7</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay></WeekDays></Calendar></Calendars>
<Tasks>
<Task><UID>1</UID><ID>1</ID><Name>基础施工</Name><Type>1</Type><WBS>1</WBS><OutlineLevel>1</OutlineLevel><Start>2026-09-22T08:00:00</Start><Finish>2026-09-23T17:00:00</Finish><Duration>PT16H0M0S</Duration><PercentComplete>20</PercentComplete><Notes>现场实测</Notes></Task>
<Task><UID>2</UID><ID>2</ID><Name>结构安装</Name><Type>1</Type><WBS>2</WBS><OutlineLevel>1</OutlineLevel><Start>2026-09-24T08:00:00</Start><Finish>2026-09-25T17:00:00</Finish><Duration>PT16H0M0S</Duration><PercentComplete>0</PercentComplete><PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
</Tasks><Resources><Resource><UID>1</UID><ID>1</ID><Name>施工班组</Name><Type>1</Type></Resource></Resources>
</Project>`

test('local engine edits and reads back all three export formats without changing the source', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'agent-pi-plan-test-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const path = join(cwd, '原计划.xml')
  await writeFile(path, fixture)
  const original = await readProjectPlan(cwd, path)
  assert.equal(original.projects[0].tasks.length, 2)
  assert.equal(original.projects[0].tasks[1].predecessors.length, 1)
  for (const format of ['mspdi', 'pmxml', 'xer']) {
    await t.test(format, async () => {
      const result = await exportProjectPlan(cwd, { path, revision: original.revision, projectIndex: 0,
        changes: [{ uid: 1, name: '基础已复核', percent: 45, start: '2026-09-23T08:00:00', finish: '2026-09-24T17:00:00', notes: '中文备注：照片已核验' }], format, filename: `修订-${format}` })
      const reopened = await readProjectPlan(cwd, result.path)
      const task = reopened.projects[0].tasks.find(task => task.name === '基础已复核')
      assert.ok(task, 'Chinese task name survives export: ' + JSON.stringify(reopened.projects[0].tasks.map(task => task.name)))
      assert.ok(Math.abs(task.percent - 45) < 1e-6, 'Duration percentage survives conversion')
      assert.match(task.start, /^2026-09-23T08:00/)
      assert.match(task.finish, /^2026-09-24T17:00/)
      assert.match(task.notes, /照片已核验/)
      assert.equal(reopened.projects[0].tasks.filter(task => !task.summary).length, 2)
      assert.equal(reopened.projects[0].tasks.find(task => task.name === '结构安装').predecessors.length, 1)
      assert.equal(reopened.projects[0].resourceCount, original.projects[0].resourceCount)
      assert.ok(reopened.projects[0].calendarCount >= original.projects[0].calendarCount)
      await assert.rejects(exportProjectPlan(cwd, { path, revision: original.revision, projectIndex: 0, changes: [], format, filename: `修订-${format}` }), /EEXIST/)
    })
  }
  assert.equal(await readFile(path, 'utf8'), fixture)
  await assert.rejects(exportProjectPlan(cwd, { path, revision: 'stale', projectIndex: 0, changes: [], format: 'mspdi', filename: '冲突' }), /其他程序修改/)
  await assert.rejects(readProjectPlan(cwd, join(cwd, '..', 'outside.xml')), /ENOENT|工作区/)
  await writeFile(join(cwd, '危险.xml'), Buffer.from(fixture.replace('<Project ', '<!DOCTYPE Project [<!ENTITY x SYSTEM "file:///missing">]><Project '), 'utf16le'))
  await assert.rejects(readProjectPlan(cwd, '危险.xml'), /DTD/)
})

test('P6 exports retain both projects and change only the selected task', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'agent-pi-plan-multi-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const bytes = await readFile(new URL('./fixtures/project-plan-multi.xer', import.meta.url))
  const path = join(cwd, '双项目.xer')
  await writeFile(path, bytes)
  const original = await readProjectPlan(cwd, path)
  assert.equal(original.projects.length, 2)
  const task = original.projects[1].tasks.find(task => task.name === '设备安装')
  assert.ok(task)
  for (const format of ['xer', 'pmxml']) {
    const result = await exportProjectPlan(cwd, { path, revision: original.revision, projectIndex: 1,
      changes: [{ uid: task.uid, name: '设备安装已复核' }], format, filename: `多项目-${format}` })
    const reopened = await readProjectPlan(cwd, result.path)
    assert.equal(reopened.projects.length, 2)
    assert.equal(reopened.projects.flatMap(project => project.tasks).filter(task => task.name === '设备安装已复核').length, 1)
    assert.equal(reopened.projects.flatMap(project => project.tasks).filter(task => task.name === '基础施工').length, 1)
  }
  assert.deepEqual(await readFile(path), bytes)
})
