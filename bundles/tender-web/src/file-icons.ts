export interface FileIconMeta {
  name: string
  klass: string
}

function extOf(file: { name?: string; path?: string; type?: string }): string {
  if (file.type === 'directory') return ''
  const raw = String(file.name || file.path || '')
  const base = raw.split(/[\\/]/).pop() || raw
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

/** Icon name + CSS class for the files rail. Client renders these as filled format badges. */
export function fileIconMeta(file: { name?: string; path?: string; type?: string }): FileIconMeta {
  if (file.type === 'directory') return { name: 'folder', klass: 'ap-fico-folder' }
  const ext = extOf(file)
  if (ext === 'md' || ext === 'markdown') return { name: 'fileMd', klass: 'ap-fico-md' }
  if (ext === 'txt' || ext === 'log') return { name: 'fileText', klass: 'ap-fico-txt' }
  if (ext === 'json' || ext === 'jsonl') return { name: 'fileJson', klass: 'ap-fico-json' }
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv' || ext === 'tsv') return { name: 'fileSheet', klass: 'ap-fico-sheet' }
  if (ext === 'doc' || ext === 'docx') return { name: 'fileWord', klass: 'ap-fico-word' }
  if (ext === 'ppt' || ext === 'pptx') return { name: 'filePpt', klass: 'ap-fico-ppt' }
  if (ext === 'pdf') return { name: 'filePdf', klass: 'ap-fico-pdf' }
  if (ext === 'html' || ext === 'htm') return { name: 'fileHtml', klass: 'ap-fico-html' }
  if (/^(png|jpe?g|gif|webp|bmp|svg|ico)$/.test(ext)) return { name: 'image', klass: 'ap-fico-img' }
  return { name: 'file', klass: 'ap-fico-file' }
}

export function fileIconName(file: { name?: string; path?: string; type?: string }): string {
  return fileIconMeta(file).name
}

export function fileIconClass(file: { name?: string; path?: string; type?: string }): string {
  return fileIconMeta(file).klass
}
