import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { zstdCompressSync } from 'node:zlib'
import { decompressSessionFrames, repairProfessionalDepthSessions } from './repair-professional-depth-sessions.mjs'
import { createDepthStore } from '../bundles/tender-host/src/professional-depth-store.mjs'
import { createDepthTemplates } from '../bundles/tender-host/src/professional-depth-templates.mjs'

for (const compressed of [false, true]) test(`legacy depth repair preserves log and backup (${compressed ? 'zstd' : 'plain'})`, t => {
  const home = mkdtempSync(join(tmpdir(), 'depth-repair-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const dir = join(home, 'sessions', 'workspace', 'session-one')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `session.v3.jsonl${compressed ? '.zstd' : ''}`)
  const state = { sessionId: 'session-one', enabled: true, revision: 2, brief: {}, criteria: [], checks: [] }
  const records = [{type:'session',version:3,id:'session-one',createdAt:1,isSeeded:false,delegationDepth:0},
    {seq:0,type:'session/title',data:{title:'原对话'},time:2},
    {seq:1,type:'agent-pi/professional-depth',data:state,time:3},
    {seq:2,type:'session/title',data:{title:'成果'},time:4}]
  const lines = records.map(value => JSON.stringify(value)+'\n')
  const original = compressed ? Buffer.concat(lines.map(line => zstdCompressSync(line))) : Buffer.from(lines.join(''))
  writeFileSync(path, original)
  assert.deepEqual(repairProfessionalDepthSessions(home), {scanned:1,repaired:1,errors:[]})
  assert.ok(readFileSync(path+'.agent-pi-depth-original').equals(original))
  const bytes = readFileSync(path)
  const restored = (compressed ? decompressSessionFrames(bytes) : bytes).toString().trim().split('\n').map(JSON.parse)
  assert.deepEqual(restored, records.map(record => record.type === 'agent-pi/professional-depth' ? {...record,ignorable:true} : record))
  const migrated = createDepthStore(home).read('session-one')
  assert.equal(migrated.sessionId, state.sessionId)
  assert.equal(migrated.enabled, true)
  assert.deepEqual(migrated.criteria, [])
  assert.deepEqual(migrated.checks, [])
  assert.equal(migrated.brief.purpose, '')
  assert.equal(createDepthStore(home).read('another-session'),undefined)
  assert.equal(repairProfessionalDepthSessions(home).repaired,0)
  assert.ok(readFileSync(path).equals(bytes))
})

test('torn logs are left intact; other unknown events are never marked ignorable', t => {
  const home = mkdtempSync(join(tmpdir(), 'depth-torn-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  mkdirSync(join(home, 'sessions'))
  const path = join(home, 'sessions', 'session.jsonl')
  const text = '{"id":"one"}\n{"type":"agent-pi/professional-depth"}'
  writeFileSync(path,text)
  assert.equal(repairProfessionalDepthSessions(home).errors.length,1)
  assert.equal(readFileSync(path,'utf8'),text)
  writeFileSync(path,'{"id":"one"}\n{"type":"foreign/required"}\n')
  assert.equal(repairProfessionalDepthSessions(home).repaired,0)
  assert.doesNotMatch(readFileSync(path,'utf8'),/ignorable/)
})

test('manual templates persist as editable Markdown, list metadata only, and reject paths', t => {
  const home = mkdtempSync(join(tmpdir(), 'depth-template-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const templates = createDepthTemplates(home)
  assert.deepEqual(templates.list(),[])
  const saved = templates.save({title:'施工方案',content:'## 验收\n注明适用条件'})
  assert.deepEqual(templates.list(),[{id:saved.id,title:'施工方案'}])
  assert.equal(readFileSync(saved.path,'utf8'),'# 施工方案\n\n## 验收\n注明适用条件\n')
  assert.throws(() => templates.read('../outside'))
  assert.throws(() => templates.save({title:'',content:'text'}))
  assert.equal(createDepthStore(home).read('new-session'),undefined)
})
