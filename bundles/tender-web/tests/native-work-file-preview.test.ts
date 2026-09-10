import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installNativeWorkFilePreviews } from '../src/client/native-work-file-preview.js'
import { SidebarRightTabRegistry } from '../../../vendor/deepseek-harness/packages/client/ui-sidebar-right/src/client/tab-registry.ts'
import { textDefinition } from '../../../vendor/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/definition.ts'
import { sessionFileAddress, absoluteFileAddress } from '../../../vendor/deepseek-harness/packages/util/workspace-path/src/index.ts'

test('official registry routes Office/CAD once to the product and leaves text/PDF/images native', () => {
  const owner = { effect: (fn: () => unknown) => fn() } as any
  const registry = new SidebarRightTabRegistry(owner)
  registry.register(textDefinition())
  registry.register({ id: 'native-files', kind: 'files', priority: 'builtin', title: () => 'Files' })
  let body: any
  let portal: any
  const effects: unknown[][] = []
  const React = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }),
    Fragment: 'fragment', useState: () => [true, () => {}], useEffect: (_fn: unknown, deps: unknown[]) => effects.push(deps) }
  const scope = { ...owner, sidebarRightTabs: registry,
    slots: { inject: (_name: string, fn: () => void) => fn(), register: (_slot: unknown, component: unknown) => { body = component } } }
  installNativeWorkFilePreviews({ inject: (_deps: unknown, fn: (value: unknown) => void) => fn(scope) }, {
    React, ReactDOM: { createPortal: (element: any) => { portal = element; return element } }, FilePreviewOverlay: 'preview',
  })
  for (const ext of ['docx', 'xlsx', 'pptx', 'univer', 'dwg', 'dxf']) {
    const address = sessionFileAddress('session-one', `工程资料/成果.${ext}`)
    assert.equal(registry.claim(address).kind, 'agent-pi-work-file')
    assert.equal(registry.candidates(address).filter(type => type.priority === 'extension').length, 1)
  }
  for (const ext of ['txt', 'md', 'pdf', 'png', 'js']) {
    assert.equal(registry.claim(sessionFileAddress('session-one', `sample.${ext}`)).kind, 'text')
  }
  assert.equal(registry.get('files')?.id, 'native-files')
  assert.throws(() => registry.claim(absoluteFileAddress('/other/secret.xlsx')), /no registered tab type/)
  const savedDocument = globalThis.document
  try {
    globalThis.document = { body: {} } as any
    body({ useTabInfo: () => ({ tab: { contentId: sessionFileAddress('session-one', '成果.xlsx'), navigation: { revision: 2 } } }),
      useSessions: (select: any) => select({ byId: { 'session-one': { cwd: 'C:/work' } } }) })
    assert.equal(portal.props.file.path.replaceAll('\\', '/'), 'C:/work/成果.xlsx')
    assert.equal(portal.props.sessionProps.sessionId, 'session-one')
    assert.equal(effects[0][1], 2)
  } finally { globalThis.document = savedDocument }
})
