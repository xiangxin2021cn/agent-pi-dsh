import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { installProfessionalConversationView } from '../src/client/professional-conversation-view.js'
import { createProfessionalTaskSummary } from '../src/client/professional-task-summary.js'

/** StoredEntry keeps name, store, inject and children out of its options bag. */
function slotsFixture() {
  const rows=new Map(),listeners=new Map()
  const notify=name=>{for(const callback of [...(listeners.get(name)||[])])callback()}
  const slots={
    entries:name=>(rows.get(name)||[]).toSorted((a,b)=>(a.options.priority||0)-(b.options.priority||0)),
    subscribe(name,listener){const set=listeners.get(name)||new Set();listeners.set(name,set);set.add(listener);return()=>set.delete(listener)},
    register(options,component){
      assert.equal(typeof options.name,'string','register requires an explicit slot name')
      if(options.name==='conversation.input.dock')assert.equal(options.children,undefined,'the dock must not redeclare native children')
      const {name,store,inject,children,locale,...storedOptions}=options
      const row={options:storedOptions,component,...(store?{store}:{}),...(inject?{inject}:{}),...(children?{children}:{}),...(locale?{locale}:{})}
      const entries=rows.get(name)||[];rows.set(name,[...entries,row]);notify(name)
      return()=>{const next=(rows.get(name)||[]).filter(entry=>entry!==row);rows.set(name,next);notify(name)}
    },
    inject(_slot,install){return install()},
  }
  return {ctx:{slots},rows,listeners,notify}
}
function vendorPackage(name,entry='') {
  const pnpm=resolve(fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/.pnpm/',import.meta.url)))
  const folder=readdirSync(pnpm).find(row=>row===name||row.startsWith(name+'@'))
  if(!folder)throw new Error('Missing '+name)
  return createRequire(import.meta.url)(join(pnpm,folder,'node_modules',name,entry))
}
async function domFixture() {
  const {JSDOM}=vendorPackage('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'}),previous={}
  for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true})) {
    previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  }
  const React=vendorPackage('react'),{createRoot}=vendorPackage('react-dom','client.js'),root=createRoot(dom.window.document.getElementById('root'))
  return {React,root,act:React.act,document:dom.window.document,window:dom.window,async close(){await React.act(async()=>root.unmount());dom.window.close();for(const[key,value]of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}}
}
function storeFixture() {
  let state={view:null},listeners=new Set()
  return {getSnapshot:()=>state,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},actions:{openView(view,focus){state={...state,view,viewRequest:{view,focus}};for(const listener of listeners)listener()}}}
}
function renderedProps(f,entry,store,id='one') {
  return {sessionId:id,session:{sessionId:id,native:true},input:{draft:'actual user draft'},...entry.inject(id,store.actions),useStore:selector=>f.React.useSyncExternalStore(store.subscribe,()=>selector(store.getSnapshot()))}
}
async function click(f,element){assert.ok(element,'expected control');await f.act(async()=>element.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true})))}

test('shared dock uses native store and navigation without replacing chat or redeclaring children',async()=>{
  const f=await domFixture(),s=slotsFixture(),store=storeFixture(),calls=[]
  function NativeChat(){return f.React.createElement('div',{'data-native-chat':''},'Original native chat')}
  function NativeSession(){return f.React.createElement(NativeChat)}
  const inject=(id,actions)=>({openView:(view,focus)=>{calls.push({id,view,focus});actions.openView(view,focus)}})
  s.ctx.slots.register({name:'conversation.view',id:'chat',children:{'conversation.chat.node':{kind:'map',scope:'session'}}},NativeChat)
  s.ctx.slots.register({name:'conversation.session',store,inject,children:{'conversation.view':{kind:'list',scope:'session'}}},NativeSession)
  const originalChat=s.ctx.slots.entries('conversation.view')[0],originalSession=s.ctx.slots.entries('conversation.session')[0]
  function Summary(props){return props.visible?f.React.createElement('section',{'data-shared-summary':''},f.React.createElement('button',{onClick:()=>props.openView('agent-pi-task-guide','actual-focus')},'View current task')):null}
  const stop=installProfessionalConversationView(s.ctx,f.React,Summary)
  try {
    const dock=s.ctx.slots.entries('conversation.input.dock')[0]
    assert.equal(dock.options.name,undefined)
    assert.equal(dock.store,store)
    assert.equal(dock.inject,inject)
    assert.equal(dock.children,undefined)
    assert.deepEqual(s.ctx.slots.entries('conversation.view'),[originalChat])
    assert.deepEqual(s.ctx.slots.entries('conversation.session'),[originalSession])
    await f.act(async()=>f.root.render(f.React.createElement(f.React.Fragment,null,f.React.createElement(originalChat.component),f.React.createElement(dock.component,renderedProps(f,dock,store)))))
    assert.equal(f.document.querySelectorAll('[data-native-chat]').length,1)
    assert.equal(f.document.querySelectorAll('[data-shared-summary]').length,1)
    await click(f,f.document.querySelector('button'))
    assert.deepEqual(calls,[{id:'one',view:'agent-pi-task-guide',focus:'actual-focus'}])
    assert.equal(store.getSnapshot().view,'agent-pi-task-guide')
    assert.equal(f.document.querySelector('[data-shared-summary]'),null)
    assert.equal(f.document.querySelectorAll('[data-native-chat]').length,1)
  } finally {stop();await f.close()}
})

test('one shared dock appears only in default chat and native Codex conversation views',async()=>{
  const f=await domFixture(),s=slotsFixture(),store=storeFixture()
  s.ctx.slots.register({name:'conversation.session',store,inject:(_id,actions)=>({openView:actions.openView})},()=>null)
  const stop=installProfessionalConversationView(s.ctx,f.React,props=>props.visible?f.React.createElement('section',{'data-shared-summary':''},'Shared goal'):null)
  try {
    const dock=s.ctx.slots.entries('conversation.input.dock')[0]
    await f.act(async()=>f.root.render(f.React.createElement(dock.component,renderedProps(f,dock,store))))
    for(const view of [null,'chat','agent-pi-codex-main','trajectory','workbench','agent-pi-task-guide']){
      await f.act(async()=>store.actions.openView(view,''))
      assert.equal(f.document.querySelectorAll('[data-shared-summary]').length,[null,'chat','agent-pi-codex-main'].includes(view)?1:0,String(view))
    }
  } finally {stop();await f.close()}
})

test('running-session task subscriptions survive switching to workbench and return fresh findings',async()=>{
  const f=await domFixture(),s=slotsFixture(),store=storeFixture(),updates=[]
  let listener,subscriptions=0,disposed=0
  const task={sessionId:'one',revision:30,brief:{objective:'逐页核验已登记资料'},plan:[],coverage:[],questions:[],deliverables:[],findings:[],quality:{enabled:true}}
  const Summary=createProfessionalTaskSummary({React:f.React,api:async()=>({task:structuredClone(task)}),cwd:()=>'',language:()=> 'zh',onTask:(_id,next)=>updates.push(next.revision),subscribe:(_id,callback)=>{subscriptions++;listener=callback;return()=>disposed++}})
  s.ctx.slots.register({name:'conversation.session',store,inject:(_id,actions)=>({openView:actions.openView})},()=>null)
  const stop=installProfessionalConversationView(s.ctx,f.React,Summary)
  try {
    const dock=s.ctx.slots.entries('conversation.input.dock')[0]
    await f.act(async()=>f.root.render(f.React.createElement(dock.component,renderedProps(f,dock,store))))
    await f.act(async()=>store.actions.openView('workbench',''))
    assert.equal(f.document.querySelector('.ap-task-summary'),null)
    assert.equal(disposed,0,'hiding the summary preserves its canonical task reader')
    task.revision=31;task.findings=[{id:'f-new',title:'实际发现',summary:'材料存在期限差异。',goalImpact:'影响当前方案。',status:'open'}]
    await f.act(async()=>listener())
    assert.equal(updates.at(-1),31)
    await f.act(async()=>store.actions.openView('chat',''))
    assert.equal(f.document.querySelectorAll('[data-finding-id="f-new"]').length,1)
    assert.equal(subscriptions,1,'view navigation does not create duplicate task readers')
  } finally {stop();await f.close()}
  assert.equal(disposed,1)
})

test('native seat replacement and hot mounting keep one dock and clean up subscriptions',async()=>{
  const f=await domFixture(),s=slotsFixture(),firstStore=storeFixture(),secondStore=storeFixture()
  const inject=(_id,actions)=>({openView:actions.openView}),Native=()=>null,Summary=()=>f.React.createElement('section',{'data-shared-summary':''},'Shared goal')
  let removeNative=s.ctx.slots.register({name:'conversation.session',store:firstStore,inject},Native)
  let stop=installProfessionalConversationView(s.ctx,f.React,Summary)
  try {
    const original=s.ctx.slots.entries('conversation.input.dock')[0]
    s.notify('conversation.session');s.notify('conversation.session');await Promise.resolve()
    assert.equal(s.ctx.slots.entries('conversation.input.dock').length,1)
    assert.equal(s.ctx.slots.entries('conversation.input.dock')[0],original)
    removeNative();removeNative=s.ctx.slots.register({name:'conversation.session',store:secondStore,inject},Native)
    await Promise.resolve()
    const next=s.ctx.slots.entries('conversation.input.dock')[0]
    assert.notEqual(next,original)
    assert.equal(next.store,secondStore)
    assert.equal(s.ctx.slots.entries('conversation.input.dock').length,1)
    await f.act(async()=>f.root.render(f.React.createElement(next.component,renderedProps(f,next,secondStore))))
    assert.equal(f.document.querySelectorAll('[data-shared-summary]').length,1)
    stop();await Promise.resolve()
    assert.equal(s.ctx.slots.entries('conversation.input.dock').length,0)
    assert.equal(s.listeners.get('conversation.session').size,0)
    stop=installProfessionalConversationView(s.ctx,f.React,Summary)
    assert.equal(s.ctx.slots.entries('conversation.input.dock').length,1)
    s.notify('conversation.session');await Promise.resolve()
    assert.equal(s.ctx.slots.entries('conversation.input.dock').length,1)
  } finally {stop();removeNative();await f.close()}
})

