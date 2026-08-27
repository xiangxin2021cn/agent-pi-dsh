import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'
import { assertInside } from './files.ts'
import { fileMime } from './preview-export.ts'

const SITE_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

const BLOCKED = /\.(env|pem|key|p12|pfx)$/i
const SITE_PREFIX = '/api/agent-pi/site/z/'

export function encodeSiteRoot(cwd: string): string {
  return Buffer.from(String(cwd || ''), 'utf8').toString('base64url')
}

export function decodeSiteRoot(token: string): string {
  return Buffer.from(String(token || ''), 'base64url').toString('utf8')
}

export function sitePreviewUrl(cwd: string, filePath: string): string {
  const rel = relative(resolve(cwd), assertInside(cwd, filePath)).split(sep).join('/')
  const parts = rel.split('/').filter(Boolean).map(encodeURIComponent)
  return `${SITE_PREFIX}${encodeSiteRoot(cwd)}/${parts.join('/')}`
}

export function parseSitePath(pathname: string): { token: string; rel: string } | null {
  const raw = String(pathname || '')
  if (!raw.startsWith(SITE_PREFIX)) return null
  const rest = raw.slice(SITE_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const token = rest.slice(0, slash)
  const rel = rest.slice(slash + 1).split('/').map((part) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  }).join('/')
  if (!token || !rel || rel.includes('..')) return null
  return { token, rel }
}

export function siteFileMime(path: string): string {
  const ext = extname(path).toLowerCase()
  return SITE_MIME[ext] ?? fileMime(path)
}

export function readSiteFile(pathname: string): { path: string; mime: string; body: Buffer; filename: string } | null {
  const parsed = parseSitePath(pathname)
  if (!parsed) return null
  const cwd = decodeSiteRoot(parsed.token)
  if (!cwd) return null
  const path = assertInside(cwd, resolve(cwd, parsed.rel))
  if (BLOCKED.test(path) || /credentials\.ya?ml$/i.test(path)) {
    throw new Error('this file is not served as a site asset')
  }
  if (!existsSync(path) || !statSync(path).isFile()) return null
  return {
    path,
    mime: siteFileMime(path),
    body: readFileSync(path),
    filename: path.split(/[\\/]/).pop() || 'index.html',
  }
}
