const installed = new WeakSet()
const workspacesInstalled = new WeakSet()

/** Alpha.2 catalogs membership; the main view owns its own reference. */
export function mainSessionId(snapshot) {
  return Object.values(snapshot?.byId || {}).find(row => (row.retainedBy?.mainView || 0) > 0)?.id || ''
}

/** Only main workspace navigation can claim choices from the no-session draft. */
export function installKbWorkspaceBridge(sessions, uiWorkspace, kb) {
  if (!sessions || !uiWorkspace || typeof uiWorkspace.connectWorkspace !== 'function' || workspacesInstalled.has(uiWorkspace)) return () => {}
  workspacesInstalled.add(uiWorkspace)
  const connect = uiWorkspace.connectWorkspace
  let active = true
  const wrapped = async (...args) => {
    const epoch = !mainSessionId(sessions.list.getSnapshot()) ? kb.kbDraftKey() : null
    const sessionId = await connect.apply(uiWorkspace, args)
    if (active && epoch) void kb.claimDraftKbTask(sessionId, true, epoch).catch(() => {})
    return sessionId
  }
  uiWorkspace.connectWorkspace = wrapped
  return () => {
    active = false
    if (uiWorkspace.connectWorkspace === wrapped) uiWorkspace.connectWorkspace = connect
    workspacesInstalled.delete(uiWorkspace)
  }
}

/** Observe main-view ownership without intercepting background/teammate creation. */
export function installKbSessionBridge(sessions, kb, onSelection) {
  if (!sessions || installed.has(sessions)) return () => {}
  installed.add(sessions)
  let current = mainSessionId(sessions.list.getSnapshot())
  onSelection(current)
  const stop = sessions.list.subscribe(() => {
    const next = mainSessionId(sessions.list.getSnapshot())
    if (next === current) return
    current = next
    kb.resetDraftKbTask()
    onSelection(next)
  })
  return () => { stop(); installed.delete(sessions) }
}
