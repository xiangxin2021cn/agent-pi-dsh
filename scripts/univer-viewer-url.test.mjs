import assert from 'node:assert/strict'
import test from 'node:test'
import { scopeUniverViewerUrl } from '../bundles/tender-web/src/client/univer-viewer-url.js'

test('scopes the same-origin Office viewer to the active session while retaining its file and worktree', () => {
  const input = '/univer-viewer/?file=encoded%2Ffile&worktreeId=draft#sheet'
  const url = new URL(scopeUniverViewerUrl(input, 'session a&b'), 'http://localhost:3000')
  assert.equal(url.origin, 'http://localhost:3000')
  assert.equal(url.searchParams.get('sessionId'), 'session a&b')
  assert.equal(url.searchParams.get('file'), 'encoded/file')
  assert.equal(url.searchParams.get('worktreeId'), 'draft')
  assert.equal(url.hash, '#sheet')
  assert.equal(new URL(scopeUniverViewerUrl(url.pathname + url.search, 'new-session'), url.origin).searchParams.get('sessionId'), 'new-session')
})

test('does not append conversation identity to legacy, external or CAD viewers', () => {
  for (const url of ['http://127.0.0.1:9000/?file=test', 'https://example.com/univer-viewer/', '/cad-viewer/?file=test', '/api/agent-pi/univer/?file=test']) {
    assert.equal(scopeUniverViewerUrl(url, 'private-session'), url)
  }
  assert.equal(scopeUniverViewerUrl('/univer-viewer/?file=test', ''), '')
})
