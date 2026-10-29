import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { attachHttp } from '../src/http.ts'
import { addKbContent, kbRoot } from '../src/kb.ts'
import { distillTemplateDna } from '../src/template-dna.ts'
import { getSessionTemplateBindings } from '../src/template-dna-task.ts'

const manuscript = '# 工作范围\n\n使用本项目真实材料列出各项工作步骤。\n\n# 编写依据\n\n每项事实说明来源，未经确认的内容须标明待核对。\n'
function fixture(t: TestContext) {
  const cwd=mkdtempSync(join(tmpdir(),'agent-pi-dna-audit-')),keys=['AGENT_PI_KB_ROOT','DSH_HOME'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
  process.env.AGENT_PI_KB_ROOT=join(cwd,'kb');process.env.DSH_HOME=join(cwd,'dsh-home')
  t.after(()=>{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];rmSync(cwd,{recursive:true,force:true})})
  const entry=addKbContent({fileName:'neutral.md',category:'用户模板',slug:'audit-template',text:manuscript}).entry,ref={slug:entry.slug,versionId:entry.versionId!}
  const profile=distillTemplateDna(kbRoot(),ref)
  return {cwd,ref,profile,binding:{...ref,dnaId:profile.dnaId}}
}

test('select validates an actual agent but accepts the empty cwd used by new-draft claim',async t=>{
  const f=fixture(t),routes:any[]=[],agents=new Map([['new-session',{session:{id:'new-session',header:{cwd:f.cwd}}}]])
  attachHttp({webServer:{register:route=>routes.push(route)},getAgent:id=>agents.get(id)},'knowledge')
  const server=createServer((req,res)=>{Promise.resolve(routes[0].handler(req,res)).catch(error=>{res.writeHead(500);res.end(String(error))})})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port
  async function select(sessionId:string,cwd:string,templateBindings=[f.binding]){const response=await fetch(base+'/api/agent-pi/kb?cwd='+encodeURIComponent(cwd),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'select',sessionId,slugs:[f.ref.slug],templateBindings})});return {status:response.status,body:await response.json()}}
  assert.equal((await select('missing-session','')).status,500)
  assert.equal((await select('new-session','')).status,200)
  assert.deepEqual(getSessionTemplateBindings(kbRoot(),'new-session'),[f.binding])
  assert.equal((await select('new-session',join(f.cwd,'unrelated'))).status,500)
  assert.equal((await select('new-session',join(f.cwd,'unrelated'),[])).status,500)
  assert.equal((await select('missing-session','',[])).status,500)
  assert.deepEqual(getSessionTemplateBindings(kbRoot(),'new-session'),[f.binding])
})
