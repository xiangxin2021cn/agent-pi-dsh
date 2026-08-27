/** User-managed collection under a KB category, e.g. 规范 → COTO 2020. */

export interface KbFolder {
  id: string
  name: string
  category: string
  createdAt: string
}

export function normalizeKbFolderName(name?: string): string {
  return String(name || '').replace(/\s+/g, ' ').trim()
}

/**
 * Infer a collection title from a file or pack name.
 * CHAPTER n + DS VERSION 2020 (SANRAL COTO chapters) → COTO 2020.
 */
export function suggestKbFolderName(...parts: string[]): string {
  const text = parts.filter(Boolean).join(' ')
  const stem = text.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/i, '')
  if (!stem) return ''
  const yearOf = (value: string): string => {
    const year = value.match(/\b((?:19|20)\d{2})\b/)
    return year ? year[1]! : ''
  }
  const labeled = (label: string, value: string): string => {
    const year = yearOf(value)
    return year ? `${label} ${year}` : label
  }
  if (/\bCOTO\b/i.test(stem)) return labeled('COTO', stem)
  if (/\bCOLTO\b/i.test(stem)) return labeled('COLTO', stem)
  if (/\bFIDIC\b/i.test(stem)) return labeled('FIDIC', stem)
  if (/\bCHAPTER\s+\d+/i.test(stem) && /DS\s*VERSION/i.test(stem)) {
    return labeled('COTO', stem)
  }
  return ''
}

/**
 * Group entries in one category into named folders plus leftover files.
 *
 * @param entries
 * @param folders
 * @param category
 */
export function groupKbEntries<T extends { category?: string; folderId?: string }>(
  entries: T[],
  folders: KbFolder[],
  category: string,
): { folders: Array<{ folder: KbFolder; entries: T[] }>; loose: T[] } {
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => !category || entry.category === category)
  const inCat = (Array.isArray(folders) ? folders : [])
    .filter((folder) => folder.category === category)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))
  const buckets = new Map<string, T[]>(inCat.map((folder) => [folder.id, []]))
  const loose: T[] = []
  for (const entry of list) {
    const bucket = entry.folderId ? buckets.get(entry.folderId) : undefined
    if (bucket) bucket.push(entry)
    else loose.push(entry)
  }
  return {
    folders: inCat.map((folder) => ({ folder, entries: buckets.get(folder.id) || [] })),
    loose,
  }
}
