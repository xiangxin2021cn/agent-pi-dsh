/** Mount the shared task summary in the native composer dock without replacing chat. */
export function installProfessionalConversationView(ctx, React, Summary) {
  const sessionSlot = 'conversation.session'
  const dockSlot = 'conversation.input.dock'
  return ctx.slots.inject(sessionSlot, () => ctx.slots.inject(dockSlot, () => {
    let installed, stopped = false, queued = false
    const refresh = () => {
      queued = false
      if (stopped) return
      const native = ctx.slots.entries(sessionSlot).find(row => row.store && row.inject)
      if (installed?.native === native) return
      installed?.dispose()
      installed = undefined
      if (!native) return
      const Dock = props => {
        const view = props.useStore(state => state.view)
        if (view !== null && view !== 'chat' && view !== 'agent-pi-codex-main') return null
        return React.createElement(Summary, props)
      }
      installed = { native, dispose: ctx.slots.register({
        name: dockSlot, id: 'agent-pi-professional-summary', order: 10,
        store: native.store, inject: native.inject,
      }, Dock) }
    }
    const off = ctx.slots.subscribe(sessionSlot, () => {
      if (!stopped && !queued) { queued = true; queueMicrotask(refresh) }
    })
    refresh()
    return () => { stopped = true; off(); installed?.dispose() }
  }))
}
