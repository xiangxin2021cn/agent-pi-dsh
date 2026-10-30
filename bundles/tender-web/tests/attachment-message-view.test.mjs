import assert from 'node:assert/strict'
import test from 'node:test'
import { SlotCore } from '../../../vendor/deepseek-harness/packages/client/ui-slots/lib/index.js'
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
  const core = new SlotCore()
  core.register({ name: 'root', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } }, () => {})
  const slots = {
    inject: (_, setup) => setup(), entries: key => core.entries(key),
    subscribe: (key, fn) => core.subscribe(key, fn),
  }
  const React = { memo: fn => fn, createElement: (component, props) => ({ component, props }) }
  const dispose = installAttachmentMessageView({ slots, on: (_, callback) => core.onMutate(callback) }, React)
  const Native = () => {}
  const children = { 'conversation.chat.user.before': { kind: 'chain', scope: 'session' } }
  const inject = () => ({ businessAction: () => {} })
  core.register({ name: 'conversation.chat.node', key: 'user', locale: 'chat', children, inject }, Native)
  const native = core.entries('conversation.chat.node')[0]
  assert.notEqual(native.component, Native)
  const Chain = () => {}
  core.register({ name: 'conversation.chat.user.before', select: () => true }, Chain)
  await new Promise(resolve => setImmediate(resolve))
  const [wrapper] = core.entriesOfSlot('conversation.chat.node')
  assert.equal(core.entries('conversation.chat.node').length, 1)
  assert.equal(wrapper, native)
  assert.equal(wrapper.children, children)
  assert.equal(wrapper.inject, inject)
  assert.equal(wrapper.locale, 'chat')
  assert.deepEqual(core.specDynamic('conversation.chat.user.before'), { kind: 'chain', scope: 'session' })
  assert.equal(core.entries('conversation.chat.user.before')[0].component, Chain)
  const openFile = () => {}, renderMessageImages = () => {}, renderSlotChain = () => 'origin'
  const node = { data: { content: [{ type: 'text', text: 'PDF\n<!--agent-pi-attachment-tx:123-->' }] } }
  const result = wrapper.component({ node, openFile, renderMessageImages, renderSlotChain })
  assert.equal(result.component, Native)
  assert.equal(result.props.openFile, openFile)
  assert.equal(result.props.renderMessageImages, renderMessageImages)
  assert.equal(result.props.renderSlotChain, renderSlotChain)
  assert.equal(result.props.node.data.content[0].text, 'PDF')
  dispose()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(native.component, Native)
  assert.equal(core.isLive(native), true)
  assert.equal(core.entries('conversation.chat.user.before')[0].component, Chain)
})

test('native reload owns the child cascade and steering keeps its native inject face', async () => {
  const slot = 'conversation.chat.node'
  const child = 'conversation.chat.user.before'
  const core = new SlotCore()
  core.register({ name: 'root', children: { [slot]: { kind: 'keyed', scope: 'session' } } }, () => {})
  const slots = { inject: (_, setup) => setup(), entries: key => core.entries(key), subscribe: (key, fn) => core.subscribe(key, fn) }
  const React = { memo: fn => fn, createElement: (component, props) => ({ component, props }) }
  const Native = () => {}
  const mount = () => core.register({ name: slot, key: 'user', children: { [child]: { kind: 'chain', scope: 'session' } } }, Native)
  const removeNative = mount()
  const steeringInject = () => ({ renderSlotChain: () => null })
  core.register({ name: slot, key: 'steering', inject: steeringInject }, Native)
  const dispose = installAttachmentMessageView({ slots, on: (_, callback) => core.onMutate(callback) }, React)
  const [user, steering] = core.entries(slot)
  assert.notEqual(user.component, Native)
  assert.equal(steering.inject, steeringInject)
  assert.equal(steering.children, undefined)
  assert.equal(steering.inject().renderSlotChain(), null)
  const removeContribution = core.register({ name: child, select: () => true }, () => {})
  removeNative()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(core.isLive(user), false)
  assert.equal(core.specDynamic(child), undefined)
  assert.equal(core.entries(child).length, 0)
  removeContribution()
  const removeReplacement = mount()
  await new Promise(resolve => setImmediate(resolve))
  const replacement = core.entries(slot).find(entry => entry.options.key === 'user')
  assert.notEqual(replacement, user)
  assert.notEqual(replacement.component, Native)
  assert.equal(core.specDynamic(child).kind, 'chain')
  dispose()
  assert.equal(replacement.component, Native)
  assert.equal(steering.component, Native)
  assert.equal(core.isLive(replacement), true)
  assert.equal(core.specDynamic(child).kind, 'chain')
  removeReplacement()
  assert.equal(core.specDynamic(child), undefined)
})
