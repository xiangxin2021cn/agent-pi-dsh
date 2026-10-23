import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { watch, writeFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, readdir, lstat, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { importEditionData } from '../edition-data-import.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture(t) {
  const parent = resolve(process.env.AGENT_PI_TEST_TMP || tmpdir())
  await mkdir(parent,{recursive:true})
  const root = await mkdtemp(join(parent,'edition-import-'))
  t.after(async()=>{const child=relative(parent,root);assert.ok(child&&!child.startsWith('..'+sep)&&child!=='..');await rm(root,{recursive:true,force:true})})
  const source=join(root,'old'),target=join(root,'tender')
  await mkdir(source); await mkdir(target)
  async function put(path,contents){const file=join(source,path);await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,contents)}
  await put('dsh-home/sessions/workspace/session-original/session.v4.jsonl.zstd','fixture-session-original')
  await put('dsh-home/storages/workspaces.json',JSON.stringify({id:'workspace-original',sessionIds:['session-original']}))
  await put('dsh-home/attachments/plan.png','fixture-attachment')
  await put('dsh-home/agent-pi/professional-tasks/task.json',JSON.stringify({sessionId:'session-original',projectId:'project-original'}))
  await put('dsh-home/knowledge-base/company/material.md','# Company qualification')
  await put('dsh-home/skills/tender-response-writing/SKILL.md','# Tender writing')
  await put('dsh-home/integrations/provider.json','integration-marker')
  await put('dsh-home/llm-deepseek/provider.json','provider-marker')
  await put('dsh-home/.credentials.yaml','private-key-marker: not-a-real-key')
  await put('dsh-home/AGENTS.md','Project instructions')
  await put('dsh-home/agent-pi-vision.json','{}')
  await put('dsh-home/.agent-presets/default.json','{}')
  await put('codex-home/auth.json',JSON.stringify({access_token:'fake-secret-auth-marker'}))
  await put('codex-home/config.toml','model = "fixture-model"')
  await put('codex-home/agent-pi-main-threads.json',JSON.stringify({'session-original':{threadId:'native-thread-original',messages:[{text:'original dialogue'}]}}))
  await put('codex-home/sessions/2026/10/23/rollout-original.jsonl',JSON.stringify({sessionId:'session-original',threadId:'native-thread-original'}))
  await put('codex-home/skills/project-tender/SKILL.md','# Private tender skill')
  return {root,source,target,put,options:{sourceUserData:source,targetUserData:target,sourceConfirmedStopped:true}}
}
async function hashes(root) {
  const files=[]
  async function walk(path,local=''){
    for(const name of (await readdir(path)).sort()){
      const file=join(path,name),next=local?local+'/'+name:name,info=await lstat(file)
      if(info.isDirectory())await walk(file,next)
      else if(info.isSymbolicLink())files.push([next,'link'])
      else files.push([next,digest(await readFile(file))])
    }
  }
  await walk(root);return files
}
async function absent(path){await assert.rejects(lstat(path),error=>error.code==='ENOENT')}

test('copies original session identities, native threads, KB, skills and explicitly chosen credentials without changing the source',async t=>{
  const f=await fixture(t)
  await f.put('dsh-home/profiles/tender/cordis.patch.yml','old-profile-do-not-copy')
  await f.put('dsh-home/node_modules/plugin/index.js','do-not-copy')
  await f.put('dsh-home/cache/scratch.json','do-not-copy')
  await f.put('codex-home/cache/unused.json','do-not-copy')
  const before=await hashes(f.source),receipt=await importEditionData(f.options)
  assert.deepEqual(await hashes(f.source),before)
  assert.equal(await readFile(join(f.target,'dsh-home/sessions/workspace/session-original/session.v4.jsonl.zstd'),'utf8'),'fixture-session-original')
  assert.equal(JSON.parse(await readFile(join(f.target,'dsh-home/storages/workspaces.json'),'utf8')).sessionIds[0],'session-original')
  assert.equal(JSON.parse(await readFile(join(f.target,'codex-home/agent-pi-main-threads.json'),'utf8'))['session-original'].threadId,'native-thread-original')
  assert.match(await readFile(join(f.target,'dsh-home/knowledge-base/company/material.md'),'utf8'),/Company qualification/)
  assert.match(await readFile(join(f.target,'dsh-home/skills/tender-response-writing/SKILL.md'),'utf8'),/Tender writing/)
  assert.equal(JSON.parse(await readFile(join(f.target,'codex-home/auth.json'),'utf8')).access_token,'fake-secret-auth-marker')
  for(const path of ['dsh-home/profiles','dsh-home/node_modules','dsh-home/cache','codex-home/cache'])await absent(join(f.target,path))
  assert.equal(receipt.sessionFiles,1);assert.equal(receipt.nativeThreadFiles,2);assert.equal(receipt.knowledgeFiles,1);assert.equal(receipt.skillFiles,2);assert.equal(receipt.sqliteDatabases,0)
  assert.match(receipt.snapshotSha256,/^[a-f0-9]{64}$/)
  const text=await readFile(receipt.receiptPath,'utf8')
  assert.doesNotMatch(text,/fake-secret-auth-marker|private-key-marker|original dialogue|access_token/)
  assert.equal((await readdir(f.target)).some(name=>name.startsWith('.edition-import-')),false)
  await absent(join(f.target,'.edition-data-import.lock'))
})

test('refuses import without explicit stopped-source confirmation and never creates target homes',async t=>{
  const f=await fixture(t),before=await hashes(f.source)
  await assert.rejects(importEditionData({...f.options,sourceConfirmedStopped:undefined}),/完全退出/)
  assert.deepEqual(await hashes(f.source),before)
  await absent(join(f.target,'dsh-home'));await absent(join(f.target,'codex-home'))
})

test('existing target homes, including empty directories, are never overwritten',async t=>{
  for(const area of ['dsh-home','codex-home']){
    const f=await fixture(t);await mkdir(join(f.target,area));const before=await hashes(f.source)
    await assert.rejects(importEditionData(f.options),/不能覆盖/)
    assert.deepEqual(await hashes(f.source),before);assert.deepEqual(await readdir(join(f.target,area)),[])
  }
})

test('nested or identical source and destination directories are rejected before writing',async t=>{
  const f=await fixture(t),before=await hashes(f.source)
  for(const target of [f.source,join(f.source,'tender'),f.root])await assert.rejects(importEditionData({...f.options,targetUserData:target}),/相互独立/)
  assert.deepEqual(await hashes(f.source),before)
})

test('file symlinks and directory junctions outside the selected source are rejected',async t=>{
  const f=await fixture(t),outside=join(f.root,'outside');await mkdir(outside);await writeFile(join(outside,'private.txt'),'outside-marker')
  const linked=join(f.source,'dsh-home/skills/external')
  await symlink(outside,linked,process.platform==='win32'?'junction':'dir')
  const before=await hashes(f.source)
  await assert.rejects(importEditionData(f.options),/符号链接|目录联接/)
  assert.deepEqual(await hashes(f.source),before);await absent(join(f.target,'dsh-home'));await absent(join(f.target,'codex-home'))
  await rm(linked)
  if(process.platform!=='win32'){
    await symlink(join(outside,'private.txt'),join(f.source,'dsh-home/knowledge-base/external.txt'))
    await assert.rejects(importEditionData(f.options),/符号链接|目录联接/)
  }
})

test('concurrent changes to the source collection fail closed and leave both final homes absent',async t=>{
  const f=await fixture(t)
  for(let i=0;i<30;i++)await f.put('dsh-home/sessions/extra-'+i+'.jsonl','original-'+i)
  let changed=false
  const watcher=watch(f.target,(_kind,name)=>{
    if(!changed&&String(name).startsWith('.edition-import-')){changed=true;writeFileSync(join(f.source,'dsh-home/sessions/added-during-copy.jsonl'),'external-change')}
  })
  try{await assert.rejects(importEditionData(f.options),/来源文件集合或内容已变化/)}finally{watcher.close()}
  assert.equal(changed,true)
  assert.equal(await readFile(join(f.source,'dsh-home/sessions/added-during-copy.jsonl'),'utf8'),'external-change')
  await absent(join(f.target,'dsh-home'));await absent(join(f.target,'codex-home'))
  assert.ok((await readdir(f.target)).some(name=>name.startsWith('.edition-import-')))
})

test('receipt publication failure rolls back both staged homes and preserves existing target files',async t=>{
  const f=await fixture(t),before=await hashes(f.source)
  await writeFile(join(f.target,'edition-data-import-receipt.json'),'existing-receipt')
  await assert.rejects(importEditionData(f.options),error=>error.code==='EEXIST')
  await absent(join(f.target,'dsh-home'));await absent(join(f.target,'codex-home'))
  assert.equal(await readFile(join(f.target,'edition-data-import-receipt.json'),'utf8'),'existing-receipt')
  assert.deepEqual(await hashes(f.source),before)
  const stage=(await readdir(f.target)).find(name=>name.startsWith('.edition-import-'))
  assert.ok(stage);assert.equal(JSON.parse(await readFile(join(f.target,stage,'failure.json'),'utf8')).status,'failed')
})

test('valid SQLite and an uncheckpointed WAL retain native thread rows and exact database bytes',async t=>{
  const f=await fixture(t),path=join(f.source,'codex-home/state_5.sqlite'),database=new DatabaseSync(path)
  try{
    database.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE threads (id TEXT PRIMARY KEY, session_id TEXT); INSERT INTO threads VALUES ('native-thread-original','session-original')")
    const before=await hashes(f.source),receipt=await importEditionData(f.options)
    assert.equal(receipt.sqliteDatabases,1);assert.deepEqual(await hashes(f.source),before)
    for(const suffix of ['','-wal'])assert.equal(digest(await readFile(join(f.target,'codex-home/state_5.sqlite'+suffix))),digest(await readFile(path+suffix)))
    const copied=new DatabaseSync(join(f.target,'codex-home/state_5.sqlite'),{readOnly:true})
    try{assert.equal(copied.prepare('SELECT session_id FROM threads WHERE id=?').get('native-thread-original').session_id,'session-original')}finally{copied.close()}
  }finally{database.close()}
})

test('invalid SQLite or orphan WAL is rejected before publishing any home',async t=>{
  for(const file of ['state_5.sqlite','state_5.sqlite-wal']){
    const f=await fixture(t);await f.put('codex-home/'+file,'not-a-database');const before=await hashes(f.source)
    await assert.rejects(importEditionData(f.options),/数据库/)
    assert.deepEqual(await hashes(f.source),before);await absent(join(f.target,'dsh-home'));await absent(join(f.target,'codex-home'))
  }
})

test('a source file changed during copying is rejected without reverting the external edit',async t=>{
  const f=await fixture(t);let changed=false
  const file=join(f.source,'dsh-home/AGENTS.md')
  const watcher=watch(f.target,(_kind,name)=>{if(!changed&&String(name).startsWith('.edition-import-')){changed=true;writeFileSync(file,'externally-updated-instructions')}})
  try{await assert.rejects(importEditionData(f.options),/来源文件.*变化/)}finally{watcher.close()}
  assert.equal(changed,true);assert.equal(await readFile(file,'utf8'),'externally-updated-instructions')
  await absent(join(f.target,'dsh-home'));await absent(join(f.target,'codex-home'))
})

test('source roots and destination ancestors cannot be junction aliases',async t=>{
  const f=await fixture(t),alias=join(f.root,'old-alias'),external=join(f.root,'external')
  await mkdir(external);await symlink(f.source,alias,process.platform==='win32'?'junction':'dir')
  await assert.rejects(importEditionData({...f.options,sourceUserData:alias}),/符号链接|目录联接/)
  const targetAlias=join(f.root,'target-alias');await symlink(external,targetAlias,process.platform==='win32'?'junction':'dir')
  await assert.rejects(importEditionData({...f.options,targetUserData:join(targetAlias,'tender')}),/符号链接|目录联接/)
  assert.deepEqual(await readdir(external),[])
})

test('allowlisted knowledge, skill and attachment content named cache/logs/runtime is retained exactly',async t=>{
  const f=await fixture(t)
  for(const path of ['dsh-home/knowledge-base/cache/valid.md','dsh-home/skills/custom/logs/notes.md','dsh-home/attachments/runtime/details.txt','codex-home/skills/custom/profiles/example.toml'])await f.put(path,'valid-user-content:'+path)
  const before=await hashes(f.source);await importEditionData(f.options)
  for(const path of ['dsh-home/knowledge-base/cache/valid.md','dsh-home/skills/custom/logs/notes.md','dsh-home/attachments/runtime/details.txt','codex-home/skills/custom/profiles/example.toml'])assert.equal(await readFile(join(f.target,path),'utf8'),'valid-user-content:'+path)
  assert.deepEqual(await hashes(f.source),before)
})
