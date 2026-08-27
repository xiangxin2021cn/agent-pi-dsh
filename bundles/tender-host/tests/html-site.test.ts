import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  parseSitePath,
  readSiteFile,
  sitePreviewUrl,
} from '../src/html-site.ts'

test('site URL keeps relative assets on the same token origin', () => {
  const cwd = 'C:\\work\\job'
  const url = sitePreviewUrl(cwd, join(cwd, 'report', 'index.html'))
  assert.match(url, /^\/api\/agent-pi\/site\/z\/[^/]+\/report\/index\.html$/)
  const parsed = parseSitePath(url)
  assert.ok(parsed)
  assert.equal(parsed.rel, 'report/index.html')
})

test('site reader serves a sibling script next to the html file', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-site-'))
  mkdirSync(join(cwd, 'out'), { recursive: true })
  writeFileSync(join(cwd, 'out', 'index.html'), '<script src="./app.js"></script>', 'utf8')
  writeFileSync(join(cwd, 'out', 'app.js'), 'window.READY=1', 'utf8')
  const page = sitePreviewUrl(cwd, join(cwd, 'out', 'index.html'))
  const js = page.replace(/index\.html$/, 'app.js')
  const file = readSiteFile(js)
  assert.ok(file)
  assert.match(file.mime, /javascript/)
  assert.equal(file.body.toString('utf8'), 'window.READY=1')
})

test('site reader refuses path escape', () => {
  assert.equal(parseSitePath('/api/agent-pi/site/z/abc/../secret'), null)
})
