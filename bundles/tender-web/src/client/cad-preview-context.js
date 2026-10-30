function workspacePath(path) {
  const normalized = String(path || '').replaceAll('\\', '/').replace(/\/+$/, '')
  return /^(?:[a-z]:\/|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized
}

/** Drawing links may use only a source workspace already registered by the Host. */
export function resolveCadPreviewContext(detail, active, workspaces, sessions) {
  if (!/\.(?:dwg|dxf)$/i.test(detail.path || '')) return undefined
  const requested = detail.cwd || active.cwd
  if (workspacePath(requested) === workspacePath(active.cwd) && (!detail.sessionId || detail.sessionId === active.sessionId)) {
    return { cwd: active.cwd, sessionId: active.sessionId, readOnly: !active.sessionId }
  }
  const workspace = (workspaces.items || []).find(item => item.path && workspacePath(item.path) === workspacePath(requested))
  if (!workspace) return null
  const members = workspace.sessionIds || []
  const archived = workspaces.archivedSessionIds || []
  const candidates = detail.sessionId ? [detail.sessionId] : [active.sessionId, ...members]
  const sessionId = candidates.find(id => id && members.includes(id) && !archived.includes(id)
    && workspacePath(sessions.byId?.[id]?.cwd) === workspacePath(workspace.path)) || ''
  if (detail.sessionId && !sessionId) return null
  return { cwd: workspace.path, sessionId, readOnly: !sessionId }
}
