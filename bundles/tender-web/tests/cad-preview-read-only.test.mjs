import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFilePreviewOverlay } from '../src/client/file-preview-overlay.js'

for (const readOnly of [false, true]) test(`opening and navigating DWG previews only reads original files (readOnly=${readOnly})`, async () => {
  const previousWindow = globalThis.window
  globalThis.window = Object.assign(new EventTarget(), { location: { origin: 'http://127.0.0.1:12345' } })
  const slots = [], requests = []
  let cursor = 0, effects = [], changed = false
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
  const effect = (run, dependencies) => {
    const index = cursor++, previous = slots[index]
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      const current = slots[index] = { dependencies }
      effects.push(() => { previous?.cleanup?.(); current.cleanup = run() })
    }
  }
  const React = {
    createElement: h, Fragment: 'fragment',
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value
        if (!Object.is(next, slots[index])) { slots[index] = next; changed = true }
      }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial } },
    useEffect: effect, useLayoutEffect: effect,
    useCallback(callback) { cursor++; return callback },
    useMemo(callback) { cursor++; return callback() },
  }
  const viewerUrl = path => '/api/agent-pi/cad-viewer/host-decoder/index.html?cwd=C%3A%2Fisolated&path=' + encodeURIComponent(path)
  const { FilePreviewOverlay } = createFilePreviewOverlay({
    React, h, Icon: () => null, DocBtn: (title, onClick, children) => h('button', { title, onClick }, children),
    useApLang: () => 'zh', tAp: key => key, slicePreviewMarkdown: text => ({ text }),
    api: async (url, cwd, options) => {
      requests.push({ url, cwd, method: options.method })
      return { kind: 'cad', viewerUrl: viewerUrl(new URLSearchParams(url.split('?')[1]).get('path')) }
    },
  })
  const render = async props => {
    for (let pass = 0; pass < 6; pass++) {
      cursor = 0; effects = []; changed = false
      const tree = FilePreviewOverlay(props)
      for (const run of effects) run()
      await new Promise(setImmediate)
      if (!changed) return tree
    }
    assert.fail('CAD preview did not settle')
  }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return
    if (predicate(node)) return node
    return node.children?.map(child => find(child, predicate)).find(Boolean)
  }
  const findFrame = tree => find(tree, node => node.type === 'iframe' && node.props.className === 'ap-cad-frame')
  const findRetry = tree => find(tree, node => node.props.title === '重新打开图纸')
  try {
    for (const path of ['基础.dwg', '总图.DWG']) {
      const props = { cwd: 'C:/isolated', file: { path, name: path }, readOnly, onClose() {} }
      let tree = await render(props)
      const frame = findFrame(tree)
      assert.equal(frame?.props.src, viewerUrl(path), 'viewer receives the original DWG address')
      assert.equal(findRetry(tree), undefined, 'no retry is offered before a CAD error')
      const source = {}
      frame.props.ref.current = { contentWindow: source }
      const error = new Event('message')
      Object.assign(error, { origin: window.location.origin, source, data: { type: 'agent-pi-cad:error', message: 'parser failed' } })
      window.dispatchEvent(error)
      tree = await render(props)
      assert.equal(findFrame(tree).props.key, frame.props.key, 'an error does not automatically retry')
      assert.ok(findRetry(tree), 'a failed CAD preview offers a manual retry')
      assert.ok(findRetry(tree).children.includes('重新打开图纸'))
      findRetry(tree).props.onClick()
      tree = await render(props)
      assert.notEqual(findFrame(tree).props.key, frame.props.key, 'retry uses a new iframe identity instead of reusing the failed frame')
      assert.equal(findRetry(tree), undefined)
      assert.equal(find(tree, node => node.props.className === 'ap-err'), undefined, 'retry clears the old failure')
    }
    assert.deepEqual(requests, ['基础.dwg', '总图.DWG'].map(path => ({
      url: '/api/agent-pi/files/content?path=' + encodeURIComponent(path), cwd: 'C:/isolated', method: 'GET',
    })), 'preview must not start conversion or another workspace write')
  } finally {
    for (const slot of slots) slot?.cleanup?.()
    globalThis.window = previousWindow
  }
})
