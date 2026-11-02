import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createTaskGuide } from '../src/client/task-guide.js'

function vendorPackage(name,entry='') {
  const pnpm=resolve(fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/.pnpm/',import.meta.url)))
  const folder=readdirSync(pnpm).find(row=>row===name||row.startsWith(name+'@'))
  return createRequire(import.meta.url)(join(pnpm,folder,'node_modules',name,entry))
}
async function fixture() {
  const {JSDOM}=vendorPackage('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'}),previous={}
  for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  }
  const React=vendorPackage('react'),{createRoot}=vendorPackage('react-dom','client.js'),root=createRoot(dom.window.document.getElementById('root'))
  return {React,root,document:dom.window.document,window:dom.window,async close(){await React.act(async()=>root.unmount());dom.window.close();for(const[key,value]of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}}
}
const task=sessionId=>({sessionId,revision:1,brief:{objective:'隔离的工程复核任务',basis:{}},plan:[],coverage:[],questions:[],findings:[],deliverables:[],quality:{enabled:true}})
const execution=()=>({phase:'needs_review',reason:'已有工具结果待核对，不重复派发。',rootSessionId:'original-session',stageId:'calculation',attempt:{id:'attempt-123',status:'dispatched'},context:{fingerprint:'a'.repeat(64),knowledgeCount:2,templateCount:1,skillCount:3,policyState:'captured'},usage:{rounds:4,tokens:12000,elapsedMs:90000,unknownTokens:false},limits:{maxRounds:64,maxTokens:500000,maxElapsedMs:7200000,maxNoProgress:3},noProgress:1,pendingToolCount:2,unsettledChildCount:1})
const button=(f,text)=>[...f.document.querySelectorAll('button')].find(row=>row.textContent===text)
async function click(f,node){assert.ok(node);await f.React.act(async()=>node.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true})))}
function guide(f,result,options={}) {
  return createTaskGuide({React:f.React,api:async(url,_cwd,request)=>{
    assert.notEqual(request?.method,'POST','reading execution status must not dispatch or approve')
    return url.startsWith('/api/agent-pi/engineering?')?{runs:[],project:{objects:[]}}:structuredClone(result)
  },cwd:()=>'/isolated-fixture',language:()=>options.locale||'zh',...options})
}

test('the full task view shows host execution receipts and remaining limits without authorizing or accepting work',async()=>{
  const f=await fixture(),result={task:task('original-session'),execution:execution()}
  const Guide=guide(f,result)
  try {
    await f.React.act(async()=>f.root.render(f.React.createElement(Guide,{sessionId:'original-session'})))
    const panel=()=>f.document.querySelector('[data-task-execution]')
    assert.equal(panel().getAttribute('data-task-execution'),'needs_review')
    assert.match(panel().textContent,/需要核对|已有工具结果待核对，不重复派发。/)
    assert.match(panel().textContent,/原主会话：original-session|当前尝试：attempt-123 · 已派发，待结算/)
    assert.match(panel().textContent,/本轮依据：知识库 2 · 主范本 1 · 技能 3/)
    assert.match(panel().textContent,/DSH 已知父子模型轮次：4 \/ 64，剩余 60/)
    assert.match(panel().textContent,/DSH 已知父子 token：12000 \/ 500000，剩余 488000/)
    assert.match(panel().textContent,/DSH 已知累计执行分钟：1.5 \/ 120，剩余 118.5/)
    assert.match(panel().textContent,/仅为 DSH 已知用量，不代表包含外部 CLI 的完整总量/)
    assert.match(panel().textContent,/连续无实际进展：1 \/ 3|待核对工具回执：2|未结算子任务：1/)
    assert.equal(panel().querySelector('button,input,textarea'),null)
    assert.match(panel().textContent,/不代表阶段批准或客户验收/)
    await click(f,button(f,'执行计划'))
    assert.ok(panel());assert.equal(f.document.querySelectorAll('[data-task-execution]').length,1)
  } finally {await f.close()}
})

test('execution updates refresh at the same task revision and unknown tokens never show a fabricated remainder',async()=>{
  const f=await fixture(),result={task:task('original-session'),execution:execution()}
  let refresh
  const Guide=guide(f,result,{subscribe:(_id,listener)=>{refresh=listener;return()=>{}}})
  try {
    await f.React.act(async()=>f.root.render(f.React.createElement(Guide,{sessionId:'original-session'})))
    result.execution.phase='paused';result.execution.reason='用户暂停保持有效。';result.execution.usage.unknownTokens=true
    await f.React.act(async()=>refresh())
    const panel=f.document.querySelector('[data-task-execution]')
    assert.equal(panel.getAttribute('data-task-execution'),'paused')
    assert.match(panel.textContent,/自动接续已暂停|用户暂停保持有效。/)
    assert.match(panel.textContent,/父子 token：待核对（已知 12000） \/ 500000/)
    assert.doesNotMatch(panel.textContent,/剩余 488000/)
    assert.match(panel.textContent,/当前执行是否已停止，以主对话的实际执行状态为准/)
    assert.equal(result.task.revision,1)
  } finally {await f.close()}
})

test('a response without execution stays compatible and switching sessions clears the previous execution projection',async()=>{
  const f=await fixture(),results=new Map([['original-session',{task:task('original-session'),execution:execution()}],['other-session',{task:task('other-session')}]]),calls=[]
  const Guide=createTaskGuide({React:f.React,api:async(url,_cwd,options)=>{
    assert.notEqual(options?.method,'POST')
    if(url.startsWith('/api/agent-pi/engineering?'))return {runs:[],project:{objects:[]}}
    const id=new URL(url,'http://localhost').searchParams.get('sessionId');calls.push(id);return structuredClone(results.get(id))
  },cwd:()=>'/isolated-fixture',language:()=> 'zh'})
  try {
    await f.React.act(async()=>f.root.render(f.React.createElement(Guide,{sessionId:'original-session'})))
    assert.ok(f.document.querySelector('[data-task-execution]'))
    await f.React.act(async()=>f.root.render(f.React.createElement(Guide,{sessionId:'other-session'})))
    assert.equal(f.document.querySelector('[data-task-execution]'),null)
    assert.doesNotMatch(f.document.body.textContent,/attempt-123|original-session/)
    assert.ok(calls.includes('other-session'))
  } finally {await f.close()}
})

test('English execution status distinguishes completed execution from customer acceptance and incomplete usage stays unconfirmed',async()=>{
  const f=await fixture(),result={task:task('original-session'),execution:{...execution(),phase:'done',reason:'The stage ended.',usage:{rounds:4},limits:{maxRounds:64}}}
  const Guide=guide(f,result,{locale:'en'})
  try {
    await f.React.act(async()=>f.root.render(f.React.createElement(Guide,{sessionId:'original-session'})))
    const panel=f.document.querySelector('[data-task-execution]')
    assert.match(panel.textContent,/Long-task continuation|Current stage execution ended/)
    assert.match(panel.textContent,/Basis for this attempt: knowledge bases 2 · primary templates 1 · skills 3/)
    assert.match(panel.textContent,/does not establish stage approval or customer acceptance/)
    assert.match(panel.textContent,/DSH known parent and child tokens: Unconfirmed \/ Unconfirmed/)
    assert.doesNotMatch(panel.textContent,/NaN|undefined|Infinity|remaining 0/)
  } finally {await f.close()}
})

test('external CLI receipts stay separate from DSH-known allowances and unreported tokens never become zero',async()=>{
  for(const locale of ['zh','en']){
    const f=await fixture(),result={task:task('original-session'),execution:{...execution(),external:{pendingCount:2,needsReviewCount:1,failedCount:1,tokens:'unreported'}}}
    let refresh
    const Guide=guide(f,result,{locale,subscribe:(_id,listener)=>{refresh=listener;return()=>{}}})
    try{
      await f.React.act(async()=>f.root.render(f.React.createElement(Guide,{sessionId:'original-session'})))
      const external=()=>f.document.querySelector('[data-task-external]')
      assert.match(external().textContent,locale==='zh'?/外部 CLI：待结算 2 · 待复核 1 · 失败 1/:/External CLI: unsettled 2 · needs review 1 · failed 1/)
      assert.match(external().textContent,locale==='zh'?/token 未报告/:/tokens are unreported/)
      assert.match(f.document.querySelector('[data-task-execution]').textContent,locale==='zh'?/仅为 DSH 已知用量/:/only usage known to DSH/)
      assert.doesNotMatch(external().textContent,/token[s]?[:：] 0|免费|free/)
      assert.match(external().textContent,locale==='zh'?/不据此判断任务已完成/:/do not establish task completion/)
      delete result.execution.external.pendingCount
      await f.React.act(async()=>refresh())
      assert.match(external().textContent,locale==='zh'?/待结算 待核对/:/unsettled Unconfirmed/)
    }finally{await f.close()}
  }
})
