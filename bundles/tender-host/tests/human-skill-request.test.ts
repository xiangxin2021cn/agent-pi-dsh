import assert from 'node:assert/strict'
import type { IncomingMessage } from 'node:http'
import { test } from 'node:test'
import { assertHumanSkillRequest } from '../src/human-skill-request.ts'

const request = (headers: IncomingMessage['headers'], encrypted = false) => ({ headers: { host: '127.0.0.1:4397', ...headers }, socket: { encrypted } }) as unknown as Pick<IncomingMessage, 'headers' | 'socket'>
test('cross-site simple posts and JSON with a foreign origin cannot mint human skill authority', () => {
  assert.throws(() => assertHumanSkillRequest(request({ 'content-type': 'text/plain', origin: 'https://malicious.example', 'sec-fetch-site': 'cross-site' })), /application\/json/)
  assert.throws(() => assertHumanSkillRequest(request({ 'content-type': 'application/json', origin: 'https://malicious.example' })), /来源与当前应用不同/)
  for (const site of ['cross-site', 'same-site']) assert.throws(() => assertHumanSkillRequest(request({ 'content-type': 'application/json', origin: 'http://127.0.0.1:4397', 'sec-fetch-site': site })), /跨站/)
  assert.throws(() => assertHumanSkillRequest(request({ 'content-type': 'application/json' })), /缺少同源浏览器凭据/)
  assert.throws(() => assertHumanSkillRequest(request({ 'content-type': 'application/json', origin: 'http://127.0.0.1:4398' })), /来源与当前应用不同/)
})
test('actual application origin, JSON content type and same-origin WebView requests are allowed', () => {
  assert.doesNotThrow(() => assertHumanSkillRequest(request({ 'content-type': 'application/json; charset=utf-8', origin: 'http://127.0.0.1:4397', 'sec-fetch-site': 'same-origin' })))
  assert.doesNotThrow(() => assertHumanSkillRequest(request({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' })))
  assert.throws(() => assertHumanSkillRequest(request({ 'content-type': 'application/json', origin: 'http://127.0.0.1:4397' }, true)), /来源与当前应用不同/)
  assert.doesNotThrow(() => assertHumanSkillRequest(request({ 'content-type': 'application/json', origin: 'https://127.0.0.1:4397' }, true)))
})
