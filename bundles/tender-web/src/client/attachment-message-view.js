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
    const wrappers = new Set()
    const installed = new Map()
    let stopped = false
    let scheduled = false
    const refresh = () => {
      scheduled = false
      if (stopped) return
      for (const key of ['user', 'steering']) {
        const native = ctx.slots.entries(slot).find(entry => entry.options.key === key && !wrappers.has(entry.component))
        const previous = installed.get(key)
        if (previous?.native === native) continue
        installed.delete(key)
        previous?.dispose()
        if (!native) continue
        const View = React.memo(props => React.createElement(native.component, { ...props, node: attachmentDisplayNode(props.node) }))
        wrappers.add(View)
        const dispose = ctx.slots.register({
          name: slot, key, priority: (native.options.priority ?? 0) - 1,
          ...(native.locale ? { locale: native.locale } : {}),
          ...(native.inject ? { inject: native.inject } : {}),
        }, View)
        installed.set(key, { native, dispose })
      }
    }
    const unsubscribe = ctx.slots.subscribe(slot, () => {
      if (stopped || scheduled) return
      scheduled = true
      queueMicrotask(refresh)
    })
    refresh()
    return () => {
      stopped = true
      unsubscribe()
      for (const entry of installed.values()) entry.dispose()
      installed.clear()
    }
  })
}
