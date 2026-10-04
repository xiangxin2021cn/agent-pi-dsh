const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('agentPiDesktop', {
  relaunch: () => ipcRenderer.invoke('app-relaunch'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) || '' } catch { return '' }
  },
  printToPdf: (html) => ipcRenderer.invoke('print-to-pdf', html),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  revealPath: (path) => ipcRenderer.invoke('reveal-path', path),
  appVersion: () => ipcRenderer.invoke('app-version'),
  agentTeamsStatus: () => ipcRenderer.invoke('agent-teams-status'),
  setAgentTeams: (enabled) => ipcRenderer.invoke('set-agent-teams', enabled),
  compactionFallbackStatus: () => ipcRenderer.invoke('compaction-fallback-status'),
  setCompactionFallback: (enabled) => ipcRenderer.invoke('set-compaction-fallback', enabled),
  codexAuthStatus: () => ipcRenderer.invoke('codex-auth-status'),
  codexAuthLogin: () => ipcRenderer.invoke('codex-auth-login'),
  codexAuthLogout: () => ipcRenderer.invoke('codex-auth-logout'),
  codexSetDefaultModel: (model) => ipcRenderer.invoke('codex-set-default-model', model),
  codexSetDefaultReasoningEffort: (effort) => ipcRenderer.invoke('codex-set-default-reasoning-effort', effort),
  codexExecutionStatus: (sessionId) => ipcRenderer.invoke('codex-execution-status', sessionId),
  codexExecutionSubmit: (input) => ipcRenderer.invoke('codex-execution-submit', input),
  codexExecutionInterrupt: (identity) => ipcRenderer.invoke('codex-execution-interrupt', identity),
  codexExecutionReply: (identity, id, answer) => ipcRenderer.invoke('codex-execution-reply', identity, id, answer),
  onCodexExecution: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('codex-execution-event', listener)
    return () => ipcRenderer.removeListener('codex-execution-event', listener)
  },
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('update-progress', listener)
    return () => ipcRenderer.removeListener('update-progress', listener)
  },
})
