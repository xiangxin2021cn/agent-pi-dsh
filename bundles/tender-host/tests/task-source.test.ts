import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { parseTaskSource } from '../../task-guide/src/sources.ts'
import { emptyTask, reviseTask } from '../../../packages/professional-tasks/task.ts'
import { auditTask } from '../../../packages/professional-tasks/quality.ts'

test('selected PDF coverage represents every page, extraction batches and unreadable pages honestly', async t => {
  const root=mkdtempSync(join(tmpdir(),'task-source-'));t.after(()=>rmSync(root,{recursive:true,force:true}))
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage().drawText('Actual tender condition: submit the declaration on page 2.',{x:30,y:700,font,size:12});pdf.addPage()
  const path=join(root,'Tender.pdf');writeFileSync(path,await pdf.save())
  const agent={session:{header:{cwd:root}},ctx:{get:()=>({resolve:async(path:string)=>({path}),processPath:(target:any)=>target.path,readBytes:async(target:any)=>readFileSync(target.path)})}}
  const state=emptyTask('source-session')
  const first=await parseTaskSource(agent,state,{id:'tender',path,startPage:1,endPage:1})
  assert.equal(first.pageCount,2);assert.deepEqual(first.patch.coverage.map(row=>row.status),['parsed','missing'])
  assert.equal(first.patch.coverage[0].review,'pending')
  const saved=reviseTask(state,first.patch,0,'agent')
  const second=await parseTaskSource(agent,saved,{id:'tender',path,startPage:2,endPage:2})
  assert.deepEqual(second.patch.coverage.map(row=>row.status),['parsed','unreadable'])
  assert.equal(second.patch.evidence.length,1)
  const full=reviseTask(saved,second.patch,1,'agent')
  assert.ok(auditTask(full).issues.some(row=>row.code==='coverage_gap'))
  assert.ok(auditTask(full).issues.some(row=>row.code==='source_review_pending'))
  await assert.rejects(()=>parseTaskSource(agent,full,{id:'tender',path,startPage:0}),/valid pages/)
})
