import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(...parts) {
  return JSON.parse(readFileSync(join(root, ...parts), 'utf8'))
}

function readText(...parts) {
  return readFileSync(join(root, ...parts), 'utf8')
}

test('release manifests resolve to Agent Pi DSH 3.5.1', () => {
  const rootPackage = readJson('package.json')
  const desktopPackage = readJson('apps', 'desktop', 'package.json')
  const desktopLock = readJson('apps', 'desktop', 'package-lock.json')
  const compactionPackage = readJson('bundles', 'agent-pi-compaction', 'package.json')

  assert.equal(rootPackage.version, '3.5.1')
  assert.equal(desktopPackage.version, '3.5.1')
  assert.equal(desktopLock.version, '3.5.1')
  assert.equal(desktopLock.packages[''].version, '3.5.1')
  assert.equal(compactionPackage.version, '3.5.1')

  const codexModels = readText('apps', 'desktop', 'codex-models.mjs')
  assert.match(codexModels, /clientInfo: \{ name: 'agent-pi-dsh', version: '3\.5\.1' \}/)

  const website = readText('website', 'index.html')
  const websiteDocs = readText('website', 'docs.html')
  assert.match(website, /data-rel-version>v3\.5\.1</)
  assert.match(website, /Agent-Pi-DSH-3\.5\.1-x64\.exe/)
  assert.match(website, /执行账本 · 双态控制面板/)
  assert.match(websiteDocs, /3\.5\.1 执行账本与双态控制/)
  assert.match(websiteDocs, /Agent-Pi-DSH-3\.5\.1-x64\.exe/)
})

test('public website contains no application source-code host or repository links', () => {
  const publicFiles = [
    ['website', 'index.html'],
    ['website', 'docs.html'],
    ['website', 'privacy-policy.html'],
    ['website', 'code-signing-policy.html'],
    ['website', 'assets', 'js', 'main.js'],
  ]
  for (const parts of publicFiles) {
    const text = readText(...parts)
    assert.doesNotMatch(text, /github(?:\.com|\s+releases?|\s+issues?)/i, parts.join('/'))
    assert.doesNotMatch(text, /xiangxin2021cn|gh-proxy|ghfast/i, parts.join('/'))
    assert.doesNotMatch(text, /(?:当前\s*DSH\s*3\.x\s*)?源码|classic source|open-source project/i, parts.join('/'))
  }
})
