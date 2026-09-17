/** Archived conversations use an independent native reference, never main selection. */
export function installArchiveSessionView(ctx, { React, useLanguage }) {
  const h = React.createElement
  const slot = 'agent-pi.archive.conversation'
  function FixedChat({ renderSlot }) {
    return renderSlot('conversation.session', { view: 'chat' })
  }
  function Conversation({ renderFactorySlot }) {
    return renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: { views: FixedChat } })
  }
  function ArchiveViewer(props) {
    const language = useLanguage()
    const t = (zh, en) => language === 'zh' ? zh : en
    const [id, setId] = React.useState('')
    const [reference, setReference] = React.useState(null)
    const [error, setError] = React.useState('')
    React.useEffect(() => {
      const open = event => setId(event.detail?.sessionId || '')
      window.addEventListener('agent-pi-view-archive', open)
      return () => window.removeEventListener('agent-pi-view-archive', open)
    }, [])
    React.useEffect(() => {
      if (!id) { setReference(null); return }
      let active = true
      const owned = props.sessions.retain(id, { source: 'agentPiArchive' })
      setReference(owned); setError('')
      owned.ready.catch(reason => { if (active) setError(String(reason?.message || reason)) })
      return () => { active = false; owned.release() }
    }, [id, props.sessions])
    if (!id) return null
    return h('div', { className: 'ap-overlay', style: { zIndex: 180 }, role: 'dialog', 'aria-label': t('归档对话', 'Archived conversation') },
      h('div', { style: { background: 'var(--dsw-alias-background-primary,white)', width: 'min(1200px,94vw)', height: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16, padding: 16 } },
        h('button', { type: 'button', onClick: () => setId(''), style: { alignSelf: 'flex-end' } }, t('关闭归档对话', 'Close archived conversation')),
        error && h('p', { role: 'alert' }, error),
        reference?.sessionId === id && h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } },
          h(props.SessionProvider, { session: reference }, props.renderSlot(slot, {}))),
      ),
    )
  }
  ctx.inject(['sessions'], scope => {
    scope.slots.inject('shell.overlay', () => scope.slots.register({ name: 'shell.overlay', id: 'agent-pi-archive-viewer', order: 30, children: { [slot]: { kind: 'single', scope: 'session' } } }, props => h(ArchiveViewer, { ...props, sessions: scope.sessions })))
    scope.slots.inject(slot, () => scope.slots.register({ name: slot }, Conversation))
  })
}
