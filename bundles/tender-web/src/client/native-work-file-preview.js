import { parseFileAddress, resolveWorkspacePath } from '../../../../vendor/deepseek-harness/packages/util/workspace-path/src/index.ts'

/** Route alpha.2 delivery cards into the existing full Office/CAD viewers. */
export function installNativeWorkFilePreviews(ctx, { React, ReactDOM, FilePreviewOverlay }) {
  const h = React.createElement
  const id = 'agent-pi:work-file-preview'
  ctx.inject(['sidebarRightTabs', 'sessions'], (scope) => {
    function WorkFilePreview(props) {
      const { tab } = props.useTabInfo()
      const file = parseFileAddress(tab.contentId)
      const cwd = props.useSessions((state) => file?.scope === 'session' ? state.byId[file.sessionId]?.cwd || '' : '')
      const [open, setOpen] = React.useState(true)
      const showPreview = () => {
        window.dispatchEvent(new Event('agent-pi-close-preview'))
        setOpen(true)
      }
      React.useEffect(() => { showPreview() }, [tab.contentId, tab.navigation.revision])
      React.useEffect(() => {
        const close = () => setOpen(false)
        window.addEventListener('agent-pi-close-native-preview', close)
        return () => window.removeEventListener('agent-pi-close-native-preview', close)
      }, [])
      if (!file || file.scope !== 'session' || !cwd) return h('p', null, '文件所属对话尚未就绪，请重新打开该对话。')
      const name = file.path.replaceAll('\\', '/').split('/').at(-1)
      return h(React.Fragment, null,
        h('div', { style: { padding: 20 } }, h('p', null, name),
          h('button', { type: 'button', onClick: showPreview }, '打开 Office / CAD 预览')),
        open && ReactDOM.createPortal(h(FilePreviewOverlay, {
          key: tab.contentId, cwd, file: { path: resolveWorkspacePath(cwd, file.path), name, type: 'file' },
          sessionProps: { sessionId: file.sessionId, cwd },
          onClose: () => setOpen(false), onDeleted: () => setOpen(false),
          onKbSaved: () => window.dispatchEvent(new Event('agent-pi-files-changed')),
        }), document.body),
      )
    }
    scope.effect(() => scope.sidebarRightTabs.register({
      id, kind: 'agent-pi-work-file', priority: 'extension',
      patterns: ['*.docx', '*.xlsx', '*.pptx', '*.univer', '*.dwg', '*.dxf'],
      canOpen: (address) => parseFileAddress(address)?.scope === 'session',
      title: (address) => parseFileAddress(address)?.path.split('/').at(-1) || address,
    }))
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register(
      { name: 'sidebar.right.pane.tab', key: id }, WorkFilePreview,
    ))
  })
}

export const nativeWorkFilePreviewCss = `
/* The native preview owns the right column while open; restore the product
   file rail when it closes, without reserving the width twice. */
html:has([data-sidebar-right-open]) .ap-files-dock{display:none}
html.ap-files-rail:has([data-sidebar-right-open]) [data-phase]{margin-right:0}
html.ap-files-rail:has([data-sidebar-right-open]) .ap-wb-page{right:0}
`
