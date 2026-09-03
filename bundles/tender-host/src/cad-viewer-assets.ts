import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CAD_VIEWER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../tender-web/lib/cad-viewer')

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.otf': 'font/otf',
  '.shx': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export function cadViewerAssetPath(requestPath: string): string | null {
  const name = String(requestPath || 'index.html').replaceAll('\\', '/') || 'index.html'
  const segments = name.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) return null
  const path = resolve(CAD_VIEWER_DIR, ...segments)
  const escaped = relative(CAD_VIEWER_DIR, path)
  if (!escaped || escaped.startsWith('..') || resolve(CAD_VIEWER_DIR, escaped) !== path) return null
  if (!existsSync(path) || !statSync(path).isFile()) return null
  return path
}

export function readCadViewerAsset(requestPath: string): {
  body: Buffer
  mime: string
  filename: string
} | null {
  const path = cadViewerAssetPath(requestPath)
  if (!path) return null
  return {
    body: readFileSync(path),
    mime: MIME[extname(path).toLowerCase()] || 'application/octet-stream',
    filename: path.slice(CAD_VIEWER_DIR.length + 1).replaceAll('\\', '/'),
  }
}

export function cadViewerUrl(cwd: string, path: string): string {
  return `/api/agent-pi/cad-viewer/index.html?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`
}
