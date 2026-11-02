import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNativeSidebarFixture } from './sidebar-recovery-native.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const store = join(root, 'vendor/deepseek-harness/node_modules/.pnpm')
const require = createRequire(import.meta.url)
function dependency(name, entry) {
  const folder = readdirSync(store).find(item => item.startsWith(name + '@'))
  assert.ok(folder, `Existing test dependency missing: ${name}`)
  return join(store, folder, 'node_modules', name, entry)
}

test('Windows native Chrome renders focusable sidebar recovery controls in conversation and workbench without CDP', { timeout: 90000, skip: process.platform !== 'win32' ? 'Windows native Chrome regression; run on Windows for this platform-specific rendering' : false }, async () => {
  // Browser plugin not available. Existing native Chrome only; no CDP or install,
  // model, credentials, user profile or original project is used by this fixture.
  const { build, stop } = require(dependency('esbuild', 'lib/main.js'))
  const react = dependency('react', 'index.js')
  const reactDom = dependency('react-dom', 'client.js')
  const native = join(root, 'vendor/deepseek-harness/packages/client')
  const component = join(root, 'bundles/tender-web/src/client')
  const source = `
import React from ${JSON.stringify(react)}
import { createRoot } from ${JSON.stringify(reactDom)}
import { SidebarRoot } from ${JSON.stringify(join(native, 'ui-sidebar/src/client/SidebarRoot.tsx'))}
import { HeaderLeadingControls } from ${JSON.stringify(join(native, 'ui-sidebar/src/client/HeaderLeadingControls.tsx'))}
import * as sidebarLocales from ${JSON.stringify(join(native, 'ui-sidebar/src/client/locales.ts'))}
import frame from ${JSON.stringify(join(native, 'ui-layout/src/client/AppFrame.module.css'))}
import { installIconSprite } from ${JSON.stringify(join(native, 'ui-theme/src/client/icon-sprite.ts'))}
import { createFilePreviewOverlay } from ${JSON.stringify(join(component, 'file-preview-overlay.js'))}
import { clientCss } from ${JSON.stringify(join(component, 'styles.js'))}
import { AP_I18N, AP_LANGUAGE_DEFINITIONS } from ${JSON.stringify(join(component, 'locales/catalog.js'))}
const h=React.createElement, calls=[]
const language=new URLSearchParams(location.search).get('lang')||'zh', definition=AP_LANGUAGE_DEFINITIONS.find(row=>row.id===language)
const productCopy={...AP_I18N.en,...AP_I18N[language]}, sidebarCopy=sidebarLocales[language]||sidebarLocales.en
document.documentElement.lang=definition.documentLang;document.documentElement.dir=definition.rtl?'rtl':'ltr'
const Icon=(_name,size)=>h('svg',{width:size,height:size,viewBox:'0 0 16 16','aria-hidden':true},h('path',{d:'M2 2h12v12H2zM10 2v12',fill:'none',stroke:'currentColor'}))
const {FilesPanel}=createFilePreviewOverlay({React,h,Icon,FileContextMenu:()=>null,useApLang:()=>language,readWorkspaceCwd:props=>props.cwd,runtime:{},flattenFiles:rows=>rows,api:async(url,cwd,options)=>{calls.push({url,cwd,method:options.method});return {files:[]}},tAp:key=>productCopy[key]||key})
function App(){
 const [left,setLeft]=React.useState(false),[right,setRight]=React.useState(false),[workbench,setWorkbench]=React.useState(false),[revision,setRevision]=React.useState(0)
 const [narrow,setNarrow]=React.useState(innerWidth<=760)
 React.useEffect(()=>{const resize=()=>setNarrow(innerWidth<=760);addEventListener('resize',resize);return()=>removeEventListener('resize',resize)},[])
 React.useLayoutEffect(()=>{document.documentElement.classList.toggle('ap-wb-open',workbench);document.documentElement.classList.add('ap-files-rail');document.documentElement.classList.toggle('ap-files-collapsed',!right);document.documentElement.style.setProperty('--ap-files-w',right?'300px':'56px')},[workbench,right])
 const toggleSidebar=()=>setLeft(value=>!value), noop=()=>{}, t=key=>sidebarCopy[key]||({'brand.localBuild':'Agent Pi DSH'})[key]||key
 const hooks={useRemoteAccess:()=>false,usePanels:()=>[],useEntryPins:()=>[],useEntryActions:()=>false,useShortcuts:selector=>selector([]),usePanelInfo:selector=>selector({activePanelId:null})}
 const leading=h(HeaderLeadingControls,{...hooks,t,toggleSidebar,startSession:noop,trackEntryClick:noop})
 return h('div',{className:frame.frame,'data-sidebar-collapsed':!left||undefined,'data-sidebar-drawer':narrow||undefined,style:{gridTemplateColumns:(narrow?'0':left?'260':'56')+'px minmax(0,1fr) 0px'}},
  h('div',{className:frame.sidebarCol,style:narrow?{width:260}:undefined,...(narrow&&!left?{inert:true}:{})},h(SidebarRoot,{...hooks,collapsed:!left,width:left||narrow?260:56,drawer:narrow,t,toggleSidebar,startSession:noop,selectPanel:noop,setPinned:noop,trackEntryClick:noop,renderSlot:(_name,_props,options)=>options?.fallback||null})),
  h('main',{className:frame.centerCol},h('div',{'data-phase':'active'},h('h1',null,'Original main conversation'),h('textarea',{defaultValue:'保留原项目输入', 'aria-label':'Conversation draft'}))),
  h('div',{'data-shell-overlay':true,className:frame.overlayLayer},workbench?h('section',{className:'ap-wb-page',style:{insetInlineStart:(narrow?0:left?260:56)+'px'}},h('h1',null,productCopy['workbench.title']),h('p',null,'Same original project and conversation')):null),
  narrow?h('div',{'data-shell-leading':true,className:frame.leadingSeat,...(left?{inert:true}:{})},leading):null,
  h('div',{className:'ap-files-dock'+(right?'':' collapsed')},h(FilesPanel,{cwd:'C:/isolated-sidebar',collapsed:!right,onToggle:()=>setRight(value=>!value)})),
  h('div',{id:'fixture-actions'},h('button',{onClick:()=>setWorkbench(value=>!value)},'Switch workbench'),h('button',{onClick:()=>setRevision(value=>value+1)},'Background update'),h('output',null,revision)))
}
document.querySelector('#product-css').textContent=clientCss
installIconSprite({effect:callback=>callback(),on:()=>{}},undefined)
window.sidebarFixture={calls,language,copy:{sideOpen:sidebarCopy['toggle.open'],sideCollapse:sidebarCopy['toggle.collapse'],filesOpen:productCopy['files.expand'],filesCollapse:productCopy['files.collapse']}}
createRoot(document.getElementById('root')).render(h(App))
`
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Pi 3.8.8 · Sidebar recovery fixture</title><link rel="stylesheet" href="/fixture.css"><style>html,body,#root{height:100%;margin:0}html{--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-specific-sidebar-fill:#f6f7f8;--dsw-alias-border-l2:#cbd5e1;--dsw-alias-label-primary:#182432;--dsw-alias-label-secondary:#64748b;--ap-accent:#008ca6}body{font:14px Arial}main h1{padding:60px 20px}textarea{margin:20px;max-width:150px}#fixture-actions{position:fixed;bottom:20px;left:60px;z-index:80;display:flex;gap:8px}.ap-wb-page h1{margin:12px;font-size:20px}</style><style id="product-css"></style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`
  const result = await runNativeSidebarFixture({ root, source, html, react, reactDom, build, stopBuild: stop })
  console.log(JSON.stringify({ sidebarQa: result }))
})
