import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { codexModelSelection, probeCodexModels, setCodexDefaultModel, setCodexDefaultReasoningEffort } from '../codex-models.mjs'

function server(handler) {
  const calls = []
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.exitCode = null
  child.kill = () => { child.exitCode = 0; child.emit('close', 0) }
  child.stdin.once('finish', child.kill)
  let initialized = false
  const reply = (id, result) => {
    const text = JSON.stringify({ id, result }) + '\n'
    child.stdout.write(text.slice(0, 5))
    child.stdout.write(text.slice(5))
  }
  child.stdin.on('data', (chunk) => {
    for (const line of String(chunk).trim().split('\n')) {
      const message = JSON.parse(line)
      calls.push(message)
      queueMicrotask(() => {
        if (message.method === 'initialize') {
          initialized = true
          reply(message.id, {})
        } else {
          assert.equal(initialized, true, 'must await initialize before sending later requests')
          if (message.method !== 'initialized') handler(message, { reply, child })
        }
      })
    }
  })
  const options = {
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome: 'isolated-home',
    env: { CODEX_HOME: 'isolated-home' },
    spawn(command, args, processOptions) {
      assert.equal(command, 'node.exe')
      assert.deepEqual(args, ['codex.js', 'app-server', '--stdio'])
      assert.equal(processOptions.env.CODEX_HOME, 'isolated-home')
      return child
    },
  }
  return { options, calls, child }
}

function catalogServer(entries, selectedModel = null, selectedReasoningEffort = null) {
  const config = { model: selectedModel, model_reasoning_effort: selectedReasoningEffort, unrelated: 'preserved' }
  return server((message, { reply }) => {
    if (message.method === 'model/list') reply(message.id, { data: entries, nextCursor: null })
    else if (message.method === 'config/read') reply(message.id, { config })
    else if (message.method === 'config/value/write') {
      config[message.params.keyPath] = message.params.value
      reply(message.id, {})
    } else if (message.method === 'config/batchWrite') {
      for (const edit of message.params.edits) config[edit.keyPath] = edit.value
      reply(message.id, {})
    } else assert.fail('unexpected request')
  })
}

test('discovers all model pages after the initialized handshake and selects the configured execution name', async () => {
  const fixture = server((message, { reply }) => {
    if (message.method === 'config/read') return reply(message.id, { config: { model: 'model-b' } })
    assert.equal(message.method, 'model/list')
    assert.equal(message.params.includeHidden, false)
    reply(message.id, message.params.cursor === null
      ? { data: [{ id: 'picker-a', model: 'model-a', isDefault: true }], nextCursor: 'page-2' }
      : { data: [
        { id: 'picker-b', model: 'model-b', displayName: 'Model B', contextWindow: 900_000 },
        { id: 'secret', hidden: true },
      ], nextCursor: null })
  })
  const result = await probeCodexModels(fixture.options)
  assert.deepEqual(fixture.calls.map(({ method }) => method),
    ['initialize', 'initialized', 'model/list', 'model/list', 'config/read'])
  assert.equal(fixture.calls[0].params.clientInfo.version, '3.6.6')
  assert.equal(result.models.length, 2)
  assert.equal(result.defaultModel, 'model-b')
  assert.equal(result.selectedModel, 'model-b')
  assert.equal(result.model.displayName, 'Model B')
  assert.equal(result.model.contextWindow, 900_000)
  assert.equal(result.model.contextWindowSource, 'provider')
  assert.equal(result.model.maxTokensSource, 'estimated')
  assert.equal(fixture.child.stdin.writableEnded, true)
})

test('follows a catalog default without hardcoding model ids or requiring isDefault', async () => {
  for (const entries of [[{ id: 'next-provider-model' }], [{ id: 'model-a' }, { id: 'model-b', isDefault: true }]]) {
    const fixture = catalogServer(entries)
    const result = await probeCodexModels(fixture.options)
    assert.equal(result.selectedModel, null)
    assert.equal(result.defaultModel, entries.at(-1).id)
  }
})

test('does not silently substitute an unavailable saved model', () => {
  const result = codexModelSelection({ models: [{ id: 'model-a', isDefault: true }], selectedModel: 'removed' })
  assert.equal(result.selectedModel, 'removed')
  assert.equal(result.defaultModel, null)
  assert.equal(result.model, null)
})

test('rejects repeated pagination cursors instead of looping', async () => {
  const fixture = server((message, { reply }) => reply(message.id, {
    data: [{ id: 'model-a' }], nextCursor: 'same',
  }))
  await assert.rejects(probeCodexModels(fixture.options), { code: 'invalid-pagination' })
  assert.equal(fixture.calls.filter(({ method }) => method === 'model/list').length, 2)
  assert.equal(fixture.child.stdin.writableEnded, true)
})

test('reports safe protocol failure and preserves no raw server diagnostics', async () => {
  const fixture = server((message, { child }) => child.stdout.write(JSON.stringify({
    id: message.id, error: { code: -32000, message: 'secret-account-value' },
  }) + '\n'))
  await assert.rejects(probeCodexModels(fixture.options), (error) => {
    assert.equal(error.code, 'rpc')
    assert.doesNotMatch(error.message, /secret-account-value/)
    return true
  })
})

test('times out a missing response and closes the server input', async () => {
  const fixture = server(() => {})
  await assert.rejects(probeCodexModels({ ...fixture.options, timeoutMs: 10 }), { code: 'timeout' })
  assert.equal(fixture.child.stdin.writableEnded, true)
})

test('rejects an early process exit without waiting for the timeout', async () => {
  const fixture = server((_message, { child }) => child.emit('close', 1))
  await assert.rejects(probeCodexModels(fixture.options), { code: 'closed' })
})

test('rejects empty or malformed catalogs', async () => {
  for (const data of [[], null]) {
    const fixture = server((message, { reply }) => reply(message.id, { data, nextCursor: null }))
    await assert.rejects(probeCodexModels(fixture.options))
  }
})

test('persists only a currently offered execution id through the official config RPC', async () => {
  const fixture = catalogServer([{ id: 'model-a', isDefault: true }, { id: 'model-b' }])
  const result = await setCodexDefaultModel(fixture.options, 'model-b')
  assert.equal(result.selectedModel, 'model-b')
  assert.equal(result.defaultModel, 'model-b')
  const write = fixture.calls.find(({ method }) => method === 'config/value/write')
  assert.deepEqual(write.params, { keyPath: 'model', value: 'model-b', mergeStrategy: 'replace' })
})

test('clears the saved override to follow the provider default', async () => {
  const fixture = catalogServer([{ id: 'model-a', isDefault: true }], 'old-model')
  const result = await setCodexDefaultModel(fixture.options, null)
  assert.equal(result.selectedModel, null)
  assert.equal(result.defaultModel, 'model-a')
  assert.equal(fixture.calls.find(({ method }) => method === 'config/value/write').params.value, null)
})

test('refuses unavailable selections without writing the existing config', async () => {
  const fixture = catalogServer([{ id: 'model-a' }])
  await assert.rejects(setCodexDefaultModel(fixture.options, 'removed'), /已不可用/)
  assert.equal(fixture.calls.some(({ method }) => method === 'config/value/write'), false)
  await assert.rejects(setCodexDefaultModel(fixture.options, {}), TypeError)
})

test('cancels model discovery when its owner is disposed', async () => {
  const fixture = server(() => {})
  const controller = new AbortController()
  const pending = probeCodexModels({ ...fixture.options, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { code: 'aborted' })
  assert.equal(fixture.child.stdin.writableEnded, true)
})

test('does not report a model preference as saved if effective config rejects it', async () => {
  const fixture = server((message, { reply }) => {
    if (message.method === 'model/list') reply(message.id, { data: [{ id: 'model-a' }], nextCursor: null })
    else if (message.method === 'config/value/write') reply(message.id, {})
    else if (message.method === 'config/read') reply(message.id, { config: { model: 'managed-model' } })
  })
  await assert.rejects(setCodexDefaultModel(fixture.options, 'model-a'), /未生效/)
})

const reasoningModels = [
  { id: 'model-a', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [
    { reasoningEffort: 'medium', description: 'Balanced' }, { reasoningEffort: 'ultra', description: 'Deep' },
    { reasoningEffort: 'future-effort', description: 'Future provider capability' },
  ] },
  { id: 'model-b', defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] },
]

test('reads the saved reasoning preference and dynamic supported efforts without hardcoding levels', async () => {
  const fixture = catalogServer(reasoningModels, null, 'future-effort')
  const result = await probeCodexModels(fixture.options)
  assert.equal(result.selectedReasoningEffort, 'future-effort')
  assert.deepEqual(result.model.supportedReasoningEfforts, reasoningModels[0].supportedReasoningEfforts)
  assert.equal(result.model.defaultReasoningEffort, 'medium')
  assert.equal(result.reasoningEffortError, undefined)
})

test('persists and clears reasoning only through the official config RPC', async () => {
  for (const effort of ['future-effort', null]) {
    const fixture = catalogServer(reasoningModels, 'model-a', 'ultra')
    const result = await setCodexDefaultReasoningEffort(fixture.options, effort)
    assert.equal(result.selectedReasoningEffort, effort)
    assert.equal(result.selectedModel, 'model-a')
    assert.deepEqual(fixture.calls.filter(({ method }) => method === 'config/value/write').map(({ params }) => params), [
      { keyPath: 'model_reasoning_effort', value: effort, mergeStrategy: 'replace' },
    ])
  }
})

test('rejects unsupported or malformed reasoning choices before writing', async () => {
  const fixture = catalogServer(reasoningModels, 'model-b')
  await assert.rejects(setCodexDefaultReasoningEffort(fixture.options, 'ultra'), /不支持/)
  assert.equal(fixture.calls.some(({ method }) => method.startsWith('config/') && method !== 'config/read'), false)
  for (const invalid of ['', ' ', {}, undefined]) {
    await assert.rejects(setCodexDefaultReasoningEffort(fixture.options, invalid), TypeError)
  }
})

test('switching models atomically clears incompatible reasoning and keeps compatible reasoning', async () => {
  for (const effort of ['ultra', 'medium']) {
    const fixture = catalogServer(reasoningModels, 'model-a', effort)
    const result = await setCodexDefaultModel(fixture.options, 'model-b')
    assert.equal(result.selectedModel, 'model-b')
    assert.equal(result.selectedReasoningEffort, effort === 'ultra' ? null : effort)
    const batch = fixture.calls.find(({ method }) => method === 'config/batchWrite')
    if (effort === 'ultra') assert.deepEqual(batch.params.edits, [
      { keyPath: 'model', value: 'model-b', mergeStrategy: 'replace' },
      { keyPath: 'model_reasoning_effort', value: null, mergeStrategy: 'replace' },
    ])
    else assert.equal(batch, undefined)
  }
})

test('an invalid saved reasoning preference is visible without mutating config on read', async () => {
  const fixture = catalogServer(reasoningModels, 'model-b', 'ultra')
  const result = await probeCodexModels(fixture.options)
  assert.equal(result.selectedReasoningEffort, 'ultra')
  assert.match(result.reasoningEffortError, /不适用/)
  assert.equal(fixture.calls.some(({ method }) => method === 'config/value/write'), false)
})

test('managed config rejection cannot be reported as a successful reasoning save', async () => {
  const fixture = server((message, { reply }) => {
    if (message.method === 'model/list') reply(message.id, { data: reasoningModels, nextCursor: null })
    else if (message.method === 'config/read') reply(message.id, { config: { model: 'model-a', model_reasoning_effort: 'medium' } })
    else if (message.method === 'config/value/write') reply(message.id, {})
  })
  await assert.rejects(setCodexDefaultReasoningEffort(fixture.options, 'ultra'), /未生效/)
})
