import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'lib/univer-assets')
const UNIVER = '0.25.1'
const REACT = '18.3.1'
const RXJS = '7.8.1'
const ECHARTS = '5.6.0'

const FILES = [
  ['react.js', `https://unpkg.com/react@${REACT}/umd/react.production.min.js`],
  ['react-dom.js', `https://unpkg.com/react-dom@${REACT}/umd/react-dom.production.min.js`],
  ['rxjs.js', `https://unpkg.com/rxjs@${RXJS}/dist/bundles/rxjs.umd.min.js`],
  ['echarts.js', `https://unpkg.com/echarts@${ECHARTS}/dist/echarts.min.js`],
  ['presets.js', `https://unpkg.com/@univerjs/presets@${UNIVER}/lib/umd/index.js`],
  ['sheets-core.js', `https://unpkg.com/@univerjs/preset-sheets-core@${UNIVER}/lib/umd/index.js`],
  ['sheets-core-en-US.js', `https://unpkg.com/@univerjs/preset-sheets-core@${UNIVER}/lib/umd/locales/en-US.js`],
  ['sheets-core-zh-CN.js', `https://unpkg.com/@univerjs/preset-sheets-core@${UNIVER}/lib/umd/locales/zh-CN.js`],
  ['sheets-core.css', `https://unpkg.com/@univerjs/preset-sheets-core@${UNIVER}/lib/index.css`],
]

async function download(url) {
  const mirrors = [url, url.replace('https://unpkg.com/', 'https://cdn.jsdelivr.net/npm/')]
  let last = ''
  for (const next of mirrors) {
    try {
      const res = await fetch(next, { redirect: 'follow' })
      if (!res.ok) {
        last = `${next} ${res.status}`
        continue
      }
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      last = `${next} ${err.message}`
    }
  }
  throw new Error(`download failed: ${last}`)
}

mkdirSync(OUT, { recursive: true })
for (const [name, url] of FILES) {
  process.stdout.write(`fetch ${name} … `)
  const body = await download(url)
  writeFileSync(join(OUT, name), body)
  console.log(`${body.length} bytes`)
}
console.log(`pinned Univer ${UNIVER} → ${OUT}`)
