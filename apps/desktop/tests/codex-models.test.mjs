import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  codexModelFromAppServerOutput,
  probeCodexModel,
} from '../codex-models.mjs'

test('selects the app-server default and applies exact official capacity', () => {
  const output = [
    JSON.stringify({ id: 1, result: {} }),
    JSON.stringify({ id: 2, result: { data: [
      { id: 'gpt-5.6-sol', isDefault: true },
      { id: 'gpt-5.6-terra', isDefault: false },
    ] } }),
  ].join('\n')
  assert.deepEqual(codexModelFromAppServerOutput(output), {
    id: 'gpt-5.6-sol',
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    contextWindowSource: 'official',
    maxTokensSource: 'official',
  })
})

test('labels an unknown default with conservative estimates', () => {
  const output = JSON.stringify({
    id: 2,
    result: { data: [{ id: 'future-codex', isDefault: true }] },
  })
  assert.deepEqual(codexModelFromAppServerOutput(output), {
    id: 'future-codex',
    contextWindow: 262_144,
    maxTokens: 32_768,
    contextWindowSource: 'estimated',
    maxTokensSource: 'estimated',
  })
})

test('prefers app-server capacity per field', () => {
  const output = JSON.stringify({
    id: 2,
    result: { data: [{
      id: 'gpt-5.6-sol',
      isDefault: true,
      contextWindow: 900_000,
    }] },
  })
  assert.deepEqual(codexModelFromAppServerOutput(output), {
    id: 'gpt-5.6-sol',
    contextWindow: 900_000,
    maxTokens: 128_000,
    contextWindowSource: 'provider',
    maxTokensSource: 'official',
  })
})

test('rejects invalid app-server capacity fields independently', () => {
  const output = JSON.stringify({
    id: 2,
    result: { data: [{
      id: 'gpt-5.6-sol',
      isDefault: true,
      contextWindow: '900000',
      maxTokens: 0,
    }] },
  })
  assert.deepEqual(codexModelFromAppServerOutput(output), {
    id: 'gpt-5.6-sol',
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    contextWindowSource: 'official',
    maxTokensSource: 'official',
  })
})

test('returns null when model/list has no usable default', () => {
  assert.equal(codexModelFromAppServerOutput('{"id":2,"result":{"data":[]}}'), null)
})

test('probes the app-server through the Codex wrapper', () => {
  const calls = []
  const codexHome = 'C:\\codex-home'
  const result = probeCodexModel({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome,
    env: { CODEX_HOME: codexHome },
    spawnSync(command, args, options) {
      calls.push({ command, args, options })
      return {
        status: 0,
        stdout: JSON.stringify({
          id: 2,
          result: { data: [{ id: 'gpt-5.6-sol', isDefault: true }] },
        }),
      }
    },
  })
  const [call] = calls

  assert.deepEqual(result, {
    id: 'gpt-5.6-sol',
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    contextWindowSource: 'official',
    maxTokensSource: 'official',
  })
  assert.equal(call.command, 'node.exe')
  assert.deepEqual(call.args, ['codex.js', 'app-server', '--stdio'])
  assert.equal(call.options.env.CODEX_HOME, codexHome)
  const initialize = JSON.parse(call.options.input.split('\n')[0])
  assert.equal(initialize.params.clientInfo.version, '3.5.3')
  assert.match(call.options.input, /"method":"model\/list"/)
  assert.equal(call.options.timeout, 10_000)
})
