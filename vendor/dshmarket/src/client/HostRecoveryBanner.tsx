/**
 * #875: the way back from DSH's own fatal recovery.
 *
 * `sanitizeProfile` renames the profile patch to a `.bak-<epoch ms>` sibling
 * and writes a stub in its place, then boots normally — 22 KB of providers,
 * models and permission presets disappeared that way with nothing on screen
 * saying so. The server decides whether the shape is really the wipe
 * (`GET /dsh-market/host-recovery`); this banner is what the user sees when it
 * is, and it only appears then. Nothing else on the page changes, because for
 * every other profile this is not a thing that happened.
 *
 * Restoring is a single click, deliberately: it is undoable (the server
 * snapshots first and keeps the current file under a new `.bak` name), and a
 * confirmation here would be asking the user to judge something they cannot
 * see — the two patches side by side.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconWarningOutline16 } from './icons.ts'
import css from './Market.module.css'
import { api } from './market-data.ts'
import type { Translate } from './market-data.ts'

/** The server's answer, narrowed the way the client reads it. */
export interface HostRecoveryView {
  patchName: string
  currentBytes: number
  backups: { name: string; stamp: number | null; bytes: number; rowIds: string[] }[]
  lostRowIds: string[]
  offerRestore: boolean
}

export function hostRecoveryOf(value: unknown): HostRecoveryView | null {
  if (value === null || typeof value !== 'object') return null
  const view = value as Record<string, unknown>
  if (typeof view.offerRestore !== 'boolean' || !Array.isArray(view.backups) || !Array.isArray(view.lostRowIds)) return null
  const backups: HostRecoveryView['backups'] = []
  for (const entry of view.backups) {
    if (entry === null || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    if (typeof item.name !== 'string' || typeof item.bytes !== 'number') continue
    backups.push({
      name: item.name,
      stamp: typeof item.stamp === 'number' ? item.stamp : null,
      bytes: item.bytes,
      rowIds: Array.isArray(item.rowIds) ? item.rowIds.filter((id): id is string => typeof id === 'string') : [],
    })
  }
  return {
    patchName: typeof view.patchName === 'string' ? view.patchName : 'cordis.patch.yml',
    currentBytes: typeof view.currentBytes === 'number' ? view.currentBytes : 0,
    backups,
    lostRowIds: view.lostRowIds.filter((id): id is string => typeof id === 'string'),
    offerRestore: view.offerRestore,
  }
}

/** "22.7 KB" / "1.2 MB" — the size is what makes the backup believable. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

interface HostRecoveryBannerProps {
  t: Translate
  /** The running host; a new boot is a new question, so a dismissal is per boot. */
  bootId: string | null
}

export function HostRecoveryBanner(props: HostRecoveryBannerProps): ReactElement | null {
  const { t, bootId } = props
  const [view, setView] = useState<HostRecoveryView | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Per boot, like the restart notice: dismissal is not destruction (the
  // backup stays where it is), but re-asking every single boot about a choice
  // already made is the nagging this project's own rules warn about.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    try { setDismissed(sessionStorage.getItem('dshm-host-recovery-dismissed') === String(bootId ?? '')) } catch { /* storage unavailable */ }
  }, [bootId])
  const dismiss = useCallback(() => {
    setDismissed(true)
    try { sessionStorage.setItem('dshm-host-recovery-dismissed', String(bootId ?? '')) } catch { /* storage unavailable */ }
  }, [bootId])

  useEffect(() => {
    let live = true
    fetch(api('/dsh-market/host-recovery'), { cache: 'no-store' })
      .then(res => res.json())
      .then(body => { if (live) setView(hostRecoveryOf(body)) })
      .catch(() => { /* the banner is an offer, not a status: silence is fine */ })
    return () => { live = false }
  }, [bootId])

  const restore = useCallback(() => {
    const newest = view?.backups[0]
    if (newest === undefined || busy) return
    setBusy(true)
    setError(null)
    fetch(api('/dsh-market/host-recovery/restore'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newest.name }),
    })
      .then(async res => ({ ok: res.ok, body: await res.json().catch(() => null) as { restored?: { rows?: number }; error?: string } | null }))
      .then(({ ok, body }) => {
        if (ok) setDone(typeof body?.restored?.rows === 'number' ? body.restored.rows : 0)
        else setError(body?.error ?? '')
      })
      .catch(() => setError('network'))
      .finally(() => setBusy(false))
  }, [busy, view])

  if (dismissed) return null
  if (done !== null) {
    return (
      <div className={css.banner}>
        <span className={css.grow}>{t('hostRecoveryRestored').replace('{0}', String(done))}</span>
        <Button variant="primary" size="sm" onClick={() => location.reload()}>{t('refresh')}</Button>
      </div>
    )
  }
  if (view === null || !view.offerRestore) return null

  const newest = view.backups[0]
  const when = newest?.stamp != null ? new Date(newest.stamp).toLocaleString() : ''
  return (
    <div className={css.banner}>
      <IconWarningOutline16 size={14} className={css.bannerIcon} />
      <span className={css.grow}>
        <div><b>{t('hostRecoveryTitle')}</b></div>
        <div>{t('hostRecoveryBody').replace('{0}', String(view.lostRowIds.length))}</div>
        {newest !== undefined && (
          <div className={css.spec}>
            {t('hostRecoverySource')
              .replace('{0}', formatBytes(newest.bytes))
              .replace('{1}', when)}
            {' — '}
            {t('hostRecoveryNote')}
          </div>
        )}
        {error !== null && <div className={css.spec}>{t('hostRecoveryFail')}{error}</div>}
      </span>
      <Button variant="primary" size="sm" disabled={busy || newest === undefined} onClick={restore}>
        {busy ? t('backupWorking') : t('hostRecoveryRestore')}
      </Button>
      <Button variant="ghost" size="sm" onClick={dismiss}>{t('dismiss')}</Button>
    </div>
  )
}
