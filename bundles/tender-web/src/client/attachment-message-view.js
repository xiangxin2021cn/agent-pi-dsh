const slot = 'conversation.chat.node'

/** Strip only product transport markers from a presentation copy, never the log. */
export function attachmentDisplayNode(node) {
  if (!Array.isArray(node?.data?.content)) return node
  let changed = false
  const content = node.data.content.map(block => {
    if (block?.type !== 'text' || typeof block.text !== 'string') return block
    const text = block.text.replace(/<!--agent-pi-attachment-tx:[^>]+?-->/g, '')
    if (text === block.text) return block
    changed = true
    return { ...block, text: text.trimEnd() }
  })
  return changed ? { ...node, data: { ...node.data, content } } : node
}

/** Keep the native bubble, attachments, references, copy action and localization. */
export function installAttachmentMessageView(ctx, React) {
  return ctx.slots.inject(slot, () => {
    const installed = new Map()
    let stopped = false
    const refresh = () => {
      if (stopped) return
      for (const key of ['user', 'steering']) {
        const native = ctx.slots.entries(slot).find(entry => entry.options.key === key)
        const previous = installed.get(key)
        if (previous?.native === native && native?.component === previous?.View) continue
        installed.delete(key)
        previous?.dispose()
        if (!native) continue
        const Component = native.component
        const View = React.memo(props => React.createElement(Component, { ...props, node: attachmentDisplayNode(props.node) }))
        // Keep the native entry as the sole owner of its child slots and inject face.
        native.component = View
        const dispose = () => { if (native.component === View) native.component = Component }
        installed.set(key, { native, View, dispose })
      }
    }
    const unsubscribe = ctx.on('slots/changed', key => { if (key === slot) refresh() })
    refresh()
    return () => {
      stopped = true
      unsubscribe()
      for (const entry of installed.values()) entry.dispose()
      installed.clear()
    }
  })
}
