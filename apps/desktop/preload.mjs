import { contextBridge, ipcRenderer, webUtils } from 'electron'

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
  codexAuthStatus: () => ipcRenderer.invoke('codex-auth-status'),
  codexAuthLogin: () => ipcRenderer.invoke('codex-auth-login'),
  codexAuthLogout: () => ipcRenderer.invoke('codex-auth-logout'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('update-progress', listener)
    return () => ipcRenderer.removeListener('update-progress', listener)
  },
})
