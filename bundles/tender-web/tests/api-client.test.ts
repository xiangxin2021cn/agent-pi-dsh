import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendWorkspaceQuery, createAgentPiApiClient } from '../src/client/api-client.js'

test('API client appends the workspace without losing an existing query', () => {
  assert.equal(
    appendWorkspaceQuery('/api/agent-pi/workbench?module=tender', 'C:\\Tender Project'),
    '/api/agent-pi/workbench?module=tender&cwd=C%3A%5CTender%20Project',
  )
})

test('API client returns JSON and preserves the request body', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const client = createAgentPiApiClient({
    fetchImpl: async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        json: async () => ({ ok: true }),
      }
    },
  })

  const body = JSON.stringify({ action: 'check' })
  assert.deepEqual(await client.api('/api/agent-pi/stage', 'D:\\Bid', { method: 'POST', body }), { ok: true })
  assert.equal(calls[0].url, '/api/agent-pi/stage?cwd=D%3A%5CBid')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.body, body)
  assert.deepEqual(calls[0].init.headers, { 'content-type': 'application/json' })
})

test('API client turns an abort timeout into the existing user-facing error', async () => {
  let cleared = false
  const client = createAgentPiApiClient({
    fetchImpl: (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }),
    setTimer: (callback: () => void) => {
      queueMicrotask(callback)
      return 7
    },
    clearTimer: (timer: number) => { cleared = timer === 7 },
  })

  await assert.rejects(
    client.api('/api/agent-pi/files/open', 'D:\\Bid', { timeoutMs: 1 }),
    /打开文件超时/,
  )
  assert.equal(cleared, true)
})

test('blob requests retain the server filename', async () => {
  const blob = new Blob(['report'])
  const client = createAgentPiApiClient({
    fetchImpl: async () => ({
      ok: true,
      blob: async () => blob,
      headers: new Headers({ 'content-disposition': "attachment; filename*=UTF-8''%E6%8A%95%E6%A0%87.zip" }),
    }),
  })

  assert.deepEqual(await client.apiBlob('/api/agent-pi/export', 'D:\\Bid'), {
    blob,
    filename: '投标.zip',
  })
})
