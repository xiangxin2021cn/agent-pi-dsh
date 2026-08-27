// One-off: list external package names imported by dsh-vision-router's shipped JS.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = 'C:/Users/xiang/Desktop/trace/dsh-vision-router'
const files = ['entry.js', 'index.js']
const walk = (dir, rel) => {
  for (const e of readdirSync(join(root, dir))) {
    const p = join(dir, e)
    if (statSync(join(root, p)).isDirectory()) walk(p, rel)
    else if (/\.(js|cjs|mjs)$/.test(e)) files.push(p)
  }
}
walk('lib')

const seen = new Set()
const re = /(?:require\(|from\s*)["']([^."'][^"']*)["']/g
for (const f of files) {
  const text = readFileSync(join(root, f), 'utf8')
  for (const m of text.matchAll(re)) {
    const n = m[1]
    if (n.startsWith('node:')) continue
    const top = n.startsWith('@') ? n.split('/').slice(0, 2).join('/') : n.split('/')[0]
    seen.add(top)
  }
}
console.log([...seen].sort().join('\n'))
