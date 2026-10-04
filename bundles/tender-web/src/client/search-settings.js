import { searchSettingsText } from './locales/search-settings.js'

export const ANYSEARCH_KEY_CONSOLE = 'https://anysearch.com/console/api-keys'

/** Operations use the native write-only credential Remote; no key read method exists here. */
export function createSearchSettingsOperations(remote, api) {
  const unwrap = result => {
    if (!result?.ok) throw new Error('Credential operation failed')
    return result.value
  }
  return {
    view: () => api('/api/agent-pi/search-settings'),
    describe: async ref => unwrap(await remote.credentials.describe([ref]))[ref],
    save: async (ref, key) => { unwrap(await remote.credentials.set(ref, key.trim())) },
    remove: async ref => { unwrap(await remote.credentials.unset(ref)) },
    probe: () => api('/api/agent-pi/search-settings', '', { method: 'POST' }),
  }
}

export function createSearchSettings(React) {
  const h = React.createElement
  return function SearchSettings({ operations, locale = 'en' }) {
    const [view, setView] = React.useState(null)
    const [info, setInfo] = React.useState(null)
    const [key, setKey] = React.useState('')
    const [busy, setBusy] = React.useState(true)
    const [message, setMessage] = React.useState('')
    const [requestId, setRequestId] = React.useState('')
    const t = value => searchSettingsText(locale, value)
    React.useEffect(() => {
      let disposed = false
      setBusy(true)
      setKey('')
      operations.view().then(async current => {
        const credential = current.active ? await operations.describe(current.apiKeyRef) : null
        if (!disposed) { setView(current); setInfo(credential) }
      }).catch(() => { if (!disposed) setMessage('failed') })
        .finally(() => { if (!disposed) setBusy(false) })
      return () => { disposed = true }
    }, [operations])
    const act = async kind => {
      if (busy) return
      setBusy(true)
      setMessage('')
      setRequestId('')
      try {
        if (kind === 'probe') {
          const result = await operations.probe()
          setMessage(result.state)
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.requestId || '')) setRequestId(result.requestId)
        } else {
          if (kind === 'save') await operations.save(view.apiKeyRef, key)
          else await operations.remove(view.apiKeyRef)
          setKey('')
          setMessage(kind === 'save' ? 'saved' : 'removed')
          setInfo(await operations.describe(view.apiKeyRef))
        }
      } catch { setMessage('failed') }
      finally { setBusy(false) }
    }
    const writable = view?.active && info?.writable === true
    return h('section', { className: 'ap-codex-settings', dir: String(locale).startsWith('ar') ? 'rtl' : undefined },
      h('h2', null, t('title')),
      h('p', { className: 'ap-codex-lead' }, t('lead')),
      h('div', { className: 'ap-codex-card' },
        h('p', { role: 'status' }, view?.active ? t(info?.configured ? 'configured' : 'anonymous') : t('inactive')),
        h('a', { href: ANYSEARCH_KEY_CONSOLE, target: '_blank', rel: 'noopener noreferrer' }, t('applyKey')),
        h('p', { className: 'ap-sub' }, t('storage')),
        h('label', { htmlFor: 'ap-anysearch-key' }, t('key')),
        h('input', { id: 'ap-anysearch-key', type: 'password', autoComplete: 'new-password', value: key,
          disabled: busy || !writable, onChange: event => setKey(event.target.value), style: { display: 'block', width: '100%', margin: '8px 0' } }),
        view?.active && info && !info.writable ? h('p', { className: 'ap-sub' }, t('readOnly')) : null,
        h('button', { type: 'button', disabled: busy || !writable || !key.trim(), onClick: () => act('save') }, t('save')),
        h('button', { type: 'button', disabled: busy || !writable || !info?.configured, onClick: () => act('remove'), style: { marginInlineStart: 8 } }, t('remove')),
        h('button', { type: 'button', disabled: busy || !view?.active, onClick: () => act('probe'), style: { marginInlineStart: 8 } }, t('probe')),
        h('p', { role: 'status', 'aria-live': 'polite', className: 'ap-sub' }, busy ? t('busy') : message ? t(message) : ''),
        requestId ? h('p', { className: 'ap-sub' }, t('requestId'), ': ', h('code', null, requestId)) : null))
  }
}
