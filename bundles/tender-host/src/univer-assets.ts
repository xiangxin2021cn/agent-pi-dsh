import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../tender-web/lib/univer-assets')

const MIME: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
}

export const UNIVER_ASSET_FILES = [
  'react.js',
  'react-dom.js',
  'react-jsx-runtime.js',
  'rxjs.js',
  'echarts.js',
  'presets.js',
  'sheets-core.js',
  'sheets-core-en-US.js',
  'sheets-core-zh-CN.js',
  'sheets-core.css',
  'univer-sheet.js',
] as const

const SCRIPT_ORDER = [
  'react.js',
  'react-dom.js',
  'react-jsx-runtime.js',
  'rxjs.js',
  'echarts.js',
  'presets.js',
  'sheets-core.js',
  'sheets-core-en-US.js',
  'sheets-core-zh-CN.js',
  'univer-sheet.js',
] as const

export function univerAssetPath(name: string): string | null {
  if (!UNIVER_ASSET_FILES.includes(name as (typeof UNIVER_ASSET_FILES)[number])) return null
  const path = join(ASSET_DIR, name)
  return existsSync(path) ? path : null
}

export function readUniverAsset(name: string): { body: Buffer; mime: string; filename: string } | null {
  const path = univerAssetPath(name)
  if (!path) return null
  const ext = name.split('.').pop() || ''
  return {
    body: readFileSync(path),
    mime: MIME[ext] || 'application/octet-stream',
    filename: name,
  }
}

export function univerAssetsReady(): boolean {
  return ['presets.js', 'sheets-core.js', 'univer-sheet.js'].every((name) => univerAssetPath(name))
}

export function univerSheetPage(): string {
  const scripts = SCRIPT_ORDER.filter((name) => univerAssetPath(name))
  const css = univerAssetPath('sheets-core.css')
    ? '<link rel="stylesheet" href="/api/agent-pi/univer-assets/sheets-core.css" />'
    : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Univer</title>
  ${css}
  <style>
    html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: #fff; }
    #app { display: flex; flex-direction: column; min-height: 0; }
    .ap-univer-boot {
      display: flex; align-items: center; justify-content: center;
      height: 100%; color: #4b5563; font: 14px/1.5 system-ui, sans-serif;
    }
    .ap-univer-boot.error { color: #b42318; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <div id="app"><div class="ap-univer-boot">正在打开表格…</div></div>
  ${scripts.map((name) => `<script src="/api/agent-pi/univer-assets/${name}"></script>`).join('\n  ')}
</body>
</html>
`
}
