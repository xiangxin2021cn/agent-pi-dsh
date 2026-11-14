import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {test} from 'node:test'
import {patchUniverRc3Host} from './patch-univer-alpha1.mjs'

const source = readFileSync(new URL('../vendor/dsh-univer-office/lib/index.js', import.meta.url), 'utf8')
const helper = source.match(/function univerPeerRejection\(peer\) \{[\s\S]*?\n\}/)?.[0]
const router = source.slice(source.indexOf('function createUniverRouter('), source.indexOf('function sendJson('))

test('Office status accepts only a live authenticated owner Peer', async () => {
  assert.ok(helper, 'The reviewed Office authentication adapter must be present')
  let calls = 0
  const context = {URL, UniverError: class extends Error {}, statusRoute: async () => {calls += 1; return {ok: true}}, sendJson: (res, status, body) => Object.assign(res, {status, body})}
  runInNewContext(helper + '\n' + router + '\nthis.route = createUniverRouter({}, {})', context)
  const peer = (kind, aborted = false) => ({principal: {kind}, signal: {aborted}})
  for (const [who, expected] of [[undefined, 401], [peer('external'), 403], [peer('owner', true), 401], [peer('owner'), 200]]) {
    const response = {}
    await context.route({method: 'GET', url: '/univer-api/status'}, response, who)
    assert.equal(response.status, expected)
  }
  assert.equal(calls, 1)
})

test('Office uses explicit required authentication for HTTP and WebSocket, and rejects a partial adapter', () => {
  assert.equal(patchUniverRc3Host(source), source)
  assert.doesNotMatch(source, /connection\.requestRejection\(/)
  assert.match(source, /return async \(request, response, peer\)/)
  assert.match(source, /const httpHandler = async \(req, res, peer\)/)
  assert.match(source, /const upgradeHandler = \(req, socket, head, peer\)/)
  assert.equal((source.match(/auth: "required"/g) || []).length, 4)
  assert.throws(() => patchUniverRc3Host(source + '\nconnection.requestRejection(req)'), /partial/)
})
