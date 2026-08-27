/**
 * Product-layer archive extras that official DSH does not persist:
 * forgotten session ids (hidden from the Archive page after the user deletes)
 * and archived workspace ids (the whole workspace left the live sidebar).
 * Session logs stay in DSH persistence.
 */
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { readJson, writeJson } from './fsutil.ts'

export interface ProductArchiveStore {
  forgottenSessionIds: string[]
  archivedWorkspaceIds: string[]
}

const EMPTY: ProductArchiveStore = {
  forgottenSessionIds: [],
  archivedWorkspaceIds: [],
}

function uniqueIds(ids: unknown): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of Array.isArray(ids) ? ids : []) {
    const id = String(value || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Durable store path. Tests set AGENT_PI_ARCHIVE_FILE.
 *
 * @returns absolute json path under $DSH_HOME or the test override.
 */
export function archiveStorePath(): string {
  const explicit = process.env.AGENT_PI_ARCHIVE_FILE
  if (explicit) return resolve(explicit)
  const home = process.env.DSH_HOME
  if (home) return resolve(home, 'agent-pi', 'archive.json')
  return resolve(homedir(), '.agent-pi', 'archive.json')
}

/**
 * @returns a normalized store (missing file is empty).
 */
export function readArchiveStore(): ProductArchiveStore {
  const raw = readJson<Partial<ProductArchiveStore>>(archiveStorePath(), {})
  return {
    forgottenSessionIds: uniqueIds(raw.forgottenSessionIds),
    archivedWorkspaceIds: uniqueIds(raw.archivedWorkspaceIds),
  }
}

function writeArchiveStore(next: ProductArchiveStore): ProductArchiveStore {
  const stored = {
    forgottenSessionIds: uniqueIds(next.forgottenSessionIds),
    archivedWorkspaceIds: uniqueIds(next.archivedWorkspaceIds),
  }
  writeJson(archiveStorePath(), stored)
  return stored
}

/**
 * Hide a session from the Archive page. Official archive membership is unchanged.
 *
 * @param sessionId - durable session id.
 * @returns the updated store.
 */
export function forgetSession(sessionId: string): ProductArchiveStore {
  const id = String(sessionId || '').trim()
  if (!id) return readArchiveStore()
  const current = readArchiveStore()
  if (current.forgottenSessionIds.includes(id)) return current
  return writeArchiveStore({
    ...current,
    forgottenSessionIds: [...current.forgottenSessionIds, id],
  })
}

/**
 * Record that a workspace left the live sidebar and now lives on the Archive page.
 *
 * @param workspaceId - official workspace id.
 * @returns the updated store.
 */
export function markWorkspaceArchived(workspaceId: string): ProductArchiveStore {
  const id = String(workspaceId || '').trim()
  if (!id) return readArchiveStore()
  const current = readArchiveStore()
  if (current.archivedWorkspaceIds.includes(id)) return current
  return writeArchiveStore({
    ...current,
    archivedWorkspaceIds: [...current.archivedWorkspaceIds, id],
  })
}

/**
 * Drop a workspace from the product archive set after the user deletes it.
 *
 * @param workspaceId - official workspace id.
 * @returns the updated store.
 */
export function forgetWorkspace(workspaceId: string): ProductArchiveStore {
  const id = String(workspaceId || '').trim()
  if (!id) return readArchiveStore()
  const current = readArchiveStore()
  return writeArchiveStore({
    ...current,
    archivedWorkspaceIds: current.archivedWorkspaceIds.filter((item) => item !== id),
  })
}
