/** Default expanded files dock width. Live width is `--ap-files-w`. */
export const FILES_RAIL_EXPANDED = 300

/** Collapsed right rail. Same 56px control rail as the official left sidebar. */
export const FILES_RAIL_COLLAPSED = 56

export const FILES_RAIL_MIN = 220
export const FILES_RAIL_MAX = 560
export const FILES_RAIL_STORAGE = 'ap-files-open'
export const FILES_RAIL_WIDTH_STORAGE = 'ap-files-width'

/**
 * Clamp a dragged files-rail width.
 *
 * @param {unknown} px
 * @returns {number}
 */
export function clampFilesRailWidth(px) {
  const n = Math.round(Number(px))
  if (!Number.isFinite(n) || n <= 0) return FILES_RAIL_EXPANDED
  return Math.min(FILES_RAIL_MAX, Math.max(FILES_RAIL_MIN, n))
}

/**
 * Remembered expanded width. Missing or invalid values use the default.
 *
 * @param {{ getItem?: (key: string) => string | null } | null | undefined} storage
 * @returns {number}
 */
export function readFilesRailWidth(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return FILES_RAIL_EXPANDED
    const raw = storage.getItem(FILES_RAIL_WIDTH_STORAGE)
    if (raw == null || raw === '') return FILES_RAIL_EXPANDED
    return clampFilesRailWidth(raw)
  } catch {
    return FILES_RAIL_EXPANDED
  }
}

/**
 * @param {unknown} px
 * @param {{ setItem?: (key: string, value: string) => void } | null | undefined} storage
 * @returns {number}
 */
export function writeFilesRailWidth(px, storage) {
  const next = clampFilesRailWidth(px)
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(FILES_RAIL_WIDTH_STORAGE, String(next))
    }
  } catch {
    // localStorage can throw in a blocked or quota-full frame
  }
  return next
}

/**
 * CSS pixel width reserved for the right dock.
 *
 * @param {boolean} open
 * @param {number} expandedWidth
 * @returns {number}
 */
export function filesRailCssWidth(open, expandedWidth) {
  return open ? clampFilesRailWidth(expandedWidth) : FILES_RAIL_COLLAPSED
}

/**
 * Persist across reloads: missing or anything other than `'0'` is expanded.
 *
 * @param {{ getItem?: (key: string) => string | null } | null | undefined} storage
 * @returns {boolean}
 */
export function readFilesRailOpen(storage) {
  try {
    return !storage || storage.getItem(FILES_RAIL_STORAGE) !== '0'
  } catch {
    return true
  }
}

/**
 * @param {boolean} next
 * @param {{ setItem?: (key: string, value: string) => void } | null | undefined} storage
 */
export function writeFilesRailOpen(next, storage) {
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(FILES_RAIL_STORAGE, next ? '1' : '0')
    }
  } catch {
    // sessionStorage can throw in a blocked or quota-full frame
  }
}

/**
 * DocumentElement classes that reserve chat/workbench space for the right dock.
 *
 * @param {boolean} open
 * @param {boolean} hasWorkspace
 * @returns {{ rail: boolean, collapsed: boolean }}
 */
export function filesRailSpace(open, hasWorkspace) {
  if (!hasWorkspace) return { rail: false, collapsed: false }
  return { rail: true, collapsed: !open }
}
