import assert from 'node:assert/strict'
import test from 'node:test'
import { attachmentDisplayNode, installAttachmentMessageView } from '../src/client/attachment-message-view.js'

test('display removes the transaction marker without changing durable text, images or references', () => {
  const image = { type: 'image', attachment: { id: 'image-1' } }
  const node = { data: { content: [{ type: 'text', text: '核对图纸\n<!--agent-pi-attachment-tx:attachment%3A123-->' }, image], referenceLabels: { file: '图纸.pdf' } } }
  const display = attachmentDisplayNode(node)
  assert.equal(display.data.content[0].text, '核对图纸')
  assert.match(node.data.content[0].text, /agent-pi-attachment-tx/)
  assert.equal(display.data.content[1], image)
  assert.equal(display.data.referenceLabels, node.data.referenceLabels)
  const ordinary = { data: { content: [{ type: 'text', text: '保留 <!-- ordinary comment -->' }] } }
  assert.equal(attachmentDisplayNode(ordinary), ordinary)
})

test('native bubble arrives late, retains actions and localization, and survives overlay disposal', async () => {
  const entries = [], listeners = new Set()
  const notify = () => { for (const fn of listeners) fn() }
  const slots = {
    inject: (_, setup) => setup(), entries: () => entries,
    subscribe: (_, fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    register: (options, component) => {
      const entry = { options, component, locale: options.locale }
      entries.push(entry); notify()
      return () => { const i = entries.indexOf(entry); if (i >= 0) { entries.splice(i, 1); notify() } }
    },
  }
  const React = { memo: fn => fn, createElement: (component, props) => ({ component, props }) }
  const dispose = installAttachmentMessageView({ slots }, React)
  const Native = () => {}
  slots.register({ name: 'conversation.chat.node', key: 'user', locale: 'chat' }, Native)
  await new Promise(resolve => setImmediate(resolve))
  const wrapper = entries.find(entry => entry.component !== Native)
  assert.equal(wrapper.locale, 'chat')
  assert.ok(wrapper.options.priority < 0)
  const openFile = () => {}, renderMessageImages = () => {}
  const node = { data: { content: [{ type: 'text', text: 'PDF\n<!--agent-pi-attachment-tx:123-->' }] } }
  const result = wrapper.component({ node, openFile, renderMessageImages })
  assert.equal(result.component, Native)
  assert.equal(result.props.openFile, openFile)
  assert.equal(result.props.renderMessageImages, renderMessageImages)
  assert.equal(result.props.node.data.content[0].text, 'PDF')
  dispose()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(listeners.size, 0)
  assert.deepEqual(entries.map(entry => entry.component), [Native])
})
