import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyCadBrowserDecoderRelease } from '../../../scripts/cad-browser-decoder-release.mjs'

const CAD_VIEWER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../tender-web/lib/cad-viewer')
const PRODUCT_DIR = resolve(CAD_VIEWER_DIR, '../../../..')
const HOST_DECODER_NAMESPACE = 'host-decoder/'

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
  const hostDecoder = name.startsWith(HOST_DECODER_NAMESPACE)
  const asset = hostDecoder ? name.slice(HOST_DECODER_NAMESPACE.length) : name
  const segments = asset.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) return null
  if (hostDecoder && segments.join('/') === 'workers/libredwg-web.wasm') {
    return verifyCadBrowserDecoderRelease(PRODUCT_DIR)
  }
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
    filename: String(requestPath || 'index.html').replaceAll('\\', '/'),
  }
}

export function cadViewerUrl(cwd: string, path: string): string {
  return `/api/agent-pi/cad-viewer/${HOST_DECODER_NAMESPACE}index.html?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`
}
