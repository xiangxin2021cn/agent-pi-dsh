import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createProfessionalTaskSummary } from '../src/client/professional-task-summary.js'

function vendorPackage(name, entry='') {
  const pnpm=resolve(fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/.pnpm/',import.meta.url)))
  const folder=readdirSync(pnpm).find(row=>row===name||row.startsWith(name+'@'))
  if(!folder)throw new Error('Missing '+name)
  return createRequire(import.meta.url)(join(pnpm,folder,'node_modules',name,entry))
}
async function fixture() {
  const {JSDOM}=vendorPackage('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'}),previous={}
  for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  }
  const React=vendorPackage('react'),{createRoot}=vendorPackage('react-dom','client.js'),root=createRoot(dom.window.document.getElementById('root'))
  const click=async element=>{assert.ok(element);await React.act(async()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))}
  return {React,root,click,document:dom.window.document,window:dom.window,async close(){await React.act(async()=>root.unmount());dom.window.close();for(const[key,value]of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}}
}
const task=id=>({sessionId:id,revision:1,brief:{objective:`工程量复核 ${id}`},deliverables:[{id:'book',path:'book.xlsx'}],findings:[],questions:[],quality:{enabled:true}})
const button=(f,text)=>[...f.document.querySelectorAll('button')].find(row=>row.textContent===text)

test('task summary starts compact, exposes fresh status, and preserves drafts across collapse without dispatching actions',async()=>{
  const f=await fixture(),calls=[],value=task('one'),result={task:value,interactionState:{running:true}}
  const Summary=createProfessionalTaskSummary({React:f.React,api:async()=>{throw new Error('unexpected read')},cwd:()=>'',language:()=> 'zh',onUserAction:payload=>calls.push(payload)})
  const render=async()=>f.React.act(async()=>f.root.render(f.React.createElement(Summary,{sessionId:'one',taskResult:result})))
  try {
    await render()
    const toggle=()=>f.document.querySelector('.ap-task-summary-toggle'),body=f.document.querySelector('.ap-task-summary-body')
    assert.equal(toggle().getAttribute('aria-expanded'),'false');assert.equal(body.hidden,true)
    assert.equal(toggle().getAttribute('aria-controls'),body.id)
    assert.match(toggle().textContent,/工程量复核 one|执行中|成果 1/)
    await f.click(toggle());assert.equal(body.hidden,false)
    await f.click(button(f,'补充或调整要求'))
    const input=f.document.querySelector('textarea')
    await f.React.act(async()=>{Object.getOwnPropertyDescriptor(f.window.HTMLTextAreaElement.prototype,'value').set.call(input,'保留已核实的工程量');input.dispatchEvent(new f.window.Event('input',{bubbles:true}))})
    await f.click(toggle());assert.equal(body.hidden,true)
    value.revision=2;value.deliverables.push({id:'report',path:'report.html'});result.interactionState={paused:true,running:true}
    await render()
    assert.equal(toggle().getAttribute('aria-expanded'),'false')
    assert.match(toggle().textContent,/接续已暂停，执行未停止/);assert.match(toggle().textContent,/成果 2/)
    await f.click(toggle());assert.equal(f.document.querySelector('textarea'),input)
    assert.equal(input.value,'保留已核实的工程量');assert.deepEqual(calls,[])
    assert.ok(button(f,'核验已登记成果'));assert.ok(button(f,'暂停执行'))
  } finally {await f.close()}
})

test('switching conversations collapses the new summary and does not leak the previous expansion or editor',async()=>{
  const f=await fixture(),values=new Map(['one','two'].map(id=>[id,{task:task(id)}]))
  const Summary=createProfessionalTaskSummary({React:f.React,api:async()=>{throw new Error('unexpected read')},cwd:()=>'',language:()=> 'en'})
  const render=async id=>f.React.act(async()=>f.root.render(f.React.createElement(Summary,{sessionId:id,taskResult:values.get(id)})))
  try {
    await render('one');await f.click(f.document.querySelector('.ap-task-summary-toggle'))
    await f.click(button(f,'Add or adjust requirements'));assert.ok(f.document.querySelector('textarea'))
    await render('two')
    assert.equal(f.document.querySelector('.ap-task-summary-toggle').getAttribute('aria-expanded'),'false')
    assert.match(f.document.querySelector('.ap-task-summary-toggle').textContent,/工程量复核 two/)
    assert.equal(f.document.querySelector('textarea'),null)
    await render('one');assert.equal(f.document.querySelector('.ap-task-summary-body').hidden,true)
  } finally {await f.close()}
})

test('collapsed summaries keep receiving canonical updates and expanded actions use their latest revision and evidence',async()=>{
  const f=await fixture(),value=task('one'),calls=[],sources=[]
  let refresh
  const result=()=>({task:structuredClone(value),interactionState:{running:false,paused:false}})
  const Summary=createProfessionalTaskSummary({React:f.React,api:async()=>result(),cwd:()=>'',language:()=> 'zh',subscribe:(_id,listener)=>{refresh=listener;return()=>{}},onOpenSource:(row,id)=>sources.push({row,id}),onUserAction:async payload=>{calls.push(payload);return {...result(),interaction:{kind:payload.command.kind,dispatch:'queued',reason:'已登记。'}}}})
  try {
    await f.React.act(async()=>f.root.render(f.React.createElement(Summary,{sessionId:'one'})))
    value.revision=2;value.evidence=[{id:'drawing',title:'CAD 图纸读取',locator:'drawing.dwg'}]
    value.findings=[{id:'dimensions',title:'核对基础尺寸',summary:'图纸标注待核对。',goalImpact:'影响工程量。',evidenceIds:['drawing'],status:'open'}]
    await f.React.act(async()=>refresh())
    assert.equal(f.document.querySelector('.ap-task-summary-body').hidden,true)
    assert.equal(f.document.querySelector('[data-task-revision]').getAttribute('data-task-revision'),'2')
    assert.match(f.document.querySelector('.ap-task-summary-toggle').textContent,/发现 1/)
    assert.deepEqual(calls,[])
    await f.click(f.document.querySelector('.ap-task-summary-toggle'))
    await f.click(button(f,'CAD 图纸读取'));assert.equal(sources[0].id,'one');assert.equal(sources[0].row.id,'drawing')
    await f.click(button(f,'继续当前任务'))
    assert.equal(calls.length,1);assert.equal(calls[0].sessionId,'one');assert.equal(calls[0].revision,2)
    assert.equal(calls[0].command.kind,'continue')
  } finally {await f.close()}
})
