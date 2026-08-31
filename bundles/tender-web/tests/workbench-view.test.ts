import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createWorkbenchView } from '../src/client/workbench-view.js'

type Node = { type: unknown; props: Record<string, unknown>; children: unknown[] }

function h(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node {
  return { type, props: props || {}, children: children.flat(Infinity) }
}

function textOf(node: unknown): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return (node as Node).children.map(textOf).join('')
}

function nodesOf(node: unknown): Node[] {
  if (!node || typeof node !== 'object' || !Array.isArray((node as Node).children)) return []
  const current = node as Node
  return [current, ...current.children.flatMap(nodesOf)]
}

function createView() {
  return createWorkbenchView({
    h,
    Icon: (name: string) => h('icon', { name }),
    tAp: (key: string) => key,
    moduleIconNode: (item: { id: string }) => h('module-icon', { id: item.id }),
    moduleLabel: (item: { labelZh?: string; id: string }) => item.labelZh || item.id,
    FilePickPanel: 'file-pick-panel',
  })
}

function baseProps() {
  return {
    cwd: 'D:\\Bid',
    catalog: [{ id: 'tender', labelZh: '投标工作台' }],
    module: 'tender',
    current: { id: 'tender', labelZh: '投标工作台' },
    onSelectModule: () => {},
    refreshing: false,
    onRefresh: () => {},
    onAdopt: () => {},
    onCreate: () => {},
    moduleErrorCount: 0,
    error: '',
    specialContent: null,
    projects: [],
    selectedId: '',
    onSelectProject: () => {},
    overview: null,
    picking: false,
    pickSelected: [],
    onTogglePick: () => {},
    onClosePicker: () => {},
    onSaveFiles: () => {},
    busy: '',
  }
}

test('workbench view renders projects and forwards only explicit project selection', () => {
  const selected: string[] = []
  const View = createView()
  const tree = View({
    ...baseProps(),
    projects: [{ project: { projectId: 'project-1', name: '项目一' } }],
    selectedId: 'project-1',
    onSelectProject: (id: string) => selected.push(id),
    overview: h('overview', null, '项目概览'),
  })

  const projectButton = nodesOf(tree).find((node) => node.type === 'button' && textOf(node).includes('项目一'))
  assert.ok(projectButton)
  assert.equal(projectButton.props.className, 'ap-proj on')
  ;(projectButton.props.onClick as () => void)()
  assert.deepEqual(selected, ['project-1'])
  assert.match(textOf(tree), /项目概览/)
})

test('special workbench modules render their supplied view without project cards', () => {
  const View = createView()
  const tree = View({
    ...baseProps(),
    module: 'kb',
    specialContent: h('knowledge-panel', null, '知识库内容'),
    projects: [{ project: { projectId: 'hidden', name: '不应显示' } }],
  })

  assert.match(textOf(tree), /知识库内容/)
  assert.doesNotMatch(textOf(tree), /不应显示/)
})

test('workbench view has no API or session side effects of its own', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const source = readFileSync(join(here, '../src/client/workbench-view.js'), 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(/)
  assert.doesNotMatch(source, /\/api\/agent-pi\//)
  assert.doesNotMatch(source, /setInterval|MutationObserver/)
})
