const installed = new WeakSet()
const workspacesInstalled = new WeakSet()

/** Native workspace navigation may reuse a blank instead of creating a session. */
export function installKbWorkspaceBridge(sessions, uiWorkspace, kb) {
  if (!sessions || !uiWorkspace || typeof uiWorkspace.connectWorkspace !== 'function' || workspacesInstalled.has(uiWorkspace)) return
  workspacesInstalled.add(uiWorkspace)
  const connect = uiWorkspace.connectWorkspace.bind(uiWorkspace)
  uiWorkspace.connectWorkspace = async (...args) => {
    const snapshot = sessions.list?.getSnapshot?.()
    const epoch = snapshot && !snapshot.current ? kb.kbDraftKey() : null
    const sessionId = await connect(...args)
    if (epoch) void kb.claimDraftKbTask(sessionId, true, epoch).catch(() => {})
    return sessionId
  }
}

/** Only a successful native create owns selections made in the no-session draft. */
export function installKbSessionBridge(sessions, kb, onSelection) {
  if (!sessions || installed.has(sessions)) return
  installed.add(sessions)
  if (typeof sessions.create === 'function') {
    const create = sessions.create.bind(sessions)
    sessions.create = async (options) => {
      const snapshot = sessions.list?.getSnapshot?.()
      const epoch = snapshot && !snapshot.current && !options?.sessionId ? kb.kbDraftKey() : null
      const sessionId = await create(options)
      if (epoch) {
        // Creation already succeeded. Keep failed saves attached to this exact
        // session; the send boundary will surface the error and retain its draft.
        void kb.claimDraftKbTask(sessionId, true, epoch).catch(() => {})
      }
      return sessionId
    }
  }
  if (typeof sessions.clear === 'function') {
    const clear = sessions.clear.bind(sessions)
    sessions.clear = (...args) => {
      const result = clear(...args)
      if (!sessions.list?.getSnapshot?.()?.current) {
        kb.resetDraftKbTask()
        onSelection('')
      }
      return result
    }
  }
  for (const method of ['open', 'openSubagent']) {
    if (typeof sessions[method] !== 'function') continue
    const open = sessions[method].bind(sessions)
    sessions[method] = (...args) => {
      const result = open(...args)
      kb.resetDraftKbTask()
      onSelection(sessions.list?.getSnapshot?.()?.current || '')
      return result
    }
  }
}
