import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { AP_I18N, AP_LANGUAGE_DEFINITIONS } from '../src/client/locales/catalog.js'
import { createFilePreviewOverlay } from '../src/client/file-preview-overlay.js'

const overlay = readFileSync(new URL('../src/client/file-preview-overlay.js', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
const keys = ['files.attachToChat', 'preview.aiEdit', 'preview.aiEditSelection', 'files.attachedOne', 'files.attachedMany', 'files.pickerUnavailable']
type Node = { type: unknown; props: Record<string, any>; children: any[] }
const h = (type: unknown, props: Record<string, any> | null, ...children: any[]): Node => ({ type, props: props || {}, children: children.flat(Infinity) })
const nodesOf = (node: any): Node[] => node && Array.isArray(node.children) ? [node, ...node.children.flatMap(nodesOf)] : []
const textOf = (node: any): string => typeof node === 'string' ? node : node && Array.isArray(node.children) ? node.children.map(textOf).join('') : ''

test('file action labels and notifications have explicit translations in all ten locales', () => {
  for (const { id } of AP_LANGUAGE_DEFINITIONS) {
    const messages = AP_I18N[id]
    for (const key of keys) {
      assert.ok(messages[key], `${id}: ${key}`)
      if (id !== 'zh') assert.doesNotMatch(messages[key], /注入对话|AI 改(?:选区)?/)
    }
    assert.match(messages['files.attachedOne'], /\{name\}/)
    assert.match(messages['files.attachedMany'], /\{n\}/)
    assert.ok(messages['files.pickerUnavailable'].includes(messages['files.attachToChat']))
  }
})

test('actual file preview toolbar renders translated labels and matching tooltips', () => {
  for (const { id } of AP_LANGUAGE_DEFINITIONS) {
    let languageSubscriptions = 0
    const React = {
      createElement: h, Fragment: 'fragment',
      useState: (initial: any) => [initial, () => {}],
      useRef: (initial: any) => ({ current: initial }),
      useEffect: () => {}, useLayoutEffect: () => {},
      useCallback: (callback: any) => callback, useMemo: (callback: any) => callback(),
    }
    const { FilePreviewOverlay } = createFilePreviewOverlay({
      React, h, Icon: (name: string) => h('icon', { name }),
      DocBtn: (title: string, onClick: any, children: any) => h('button', { title, onClick }, children),
      tAp: (key: string) => AP_I18N[id][key] || key,
      useApLang: () => { languageSubscriptions++; return id },
      slicePreviewMarkdown: (text: string) => ({ text }),
    })
    const tree = FilePreviewOverlay({ cwd: 'D:/QA', file: { name: 'report.md', path: 'report.md' }, onClose: () => {} })
    for (const key of ['files.attachToChat', 'preview.aiEdit']) {
      const title = AP_I18N[id][key]
      const button = nodesOf(tree).find(node => node.type === 'button' && node.props.title === title)
      assert.ok(button, `${id}: ${key}`)
      assert.equal(textOf(button), title)
    }
    assert.equal(languageSubscriptions, 1)
  }
})

test('folder and files context menus, icon labels, selection dialog and toasts use the same translations', () => {
  assert.doesNotMatch(overlay, /['"](?:注入对话|AI 改|AI 改选区)['"]/)
  assert.match(overlay, /function FolderPreviewOverlay\(props\) \{\s*useApLang\(\)/)
  assert.equal((overlay.match(/'aria-label': tAp\('files\.attachToChat'\)/g) || []).length, 2)
  assert.equal((overlay.match(/key: 'inject'.*tAp\('files\.attachToChat'\)/g) || []).length, 2)
  assert.match(overlay, /role: 'dialog', 'aria-label': tAp\('preview\.aiEditSelection'\)/)
  assert.match(client, /showToast\(added\.length === 1 \? tAp\('files\.attachedOne', \{ name: added\[0\]\.name \}\) : tAp\('files\.attachedMany', \{ n: added\.length \}\)\)/)
  assert.match(client, /showToast\(tAp\('files\.pickerUnavailable'\)\)/)
})

test('evidence preview keeps the verified source locator visible in its header', () => {
  const React={createElement:h,Fragment:'fragment',useState:(initial:any)=>[initial,()=>{}],useRef:(initial:any)=>({current:initial}),useEffect:()=>{},useLayoutEffect:()=>{},useCallback:(callback:any)=>callback,useMemo:(callback:any)=>callback()}
  const {FilePreviewOverlay}=createFilePreviewOverlay({React,h,Icon:(name:string)=>h('icon',{name}),DocBtn:(title:string,onClick:any,children:any)=>h('button',{title,onClick},children),tAp:(key:string)=>AP_I18N.en[key]||key,useApLang:()=> 'en',slicePreviewMarkdown:(text:string)=>({text})})
  const tree=FilePreviewOverlay({cwd:'D:/QA',file:{name:'report.md',path:'report.md',locator:'第 3 页 · 工期表'},onClose:()=>{}})
  const locator=nodesOf(tree).find(row=>row.props.className==='ap-doc-source-position')
  assert.equal(textOf(locator),'第 3 页 · 工期表')
  assert.equal(locator?.props.title,'第 3 页 · 工期表')
})
