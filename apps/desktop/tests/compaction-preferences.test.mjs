import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  applyCompactionFallbackEnv,
  createCompactionFallbackPreferenceUpdate,
  normalizeCompactionFallbackPreference,
} from '../compaction-preferences.mjs'

test('missing compaction fallback preference defaults to enabled', () => {
  assert.deepEqual(normalizeCompactionFallbackPreference(), { enabled: true })
  assert.deepEqual(normalizeCompactionFallbackPreference({}), { enabled: true })
  assert.deepEqual(normalizeCompactionFallbackPreference({ closeAction: 'tray' }), { enabled: true })
})

test('explicit boolean compaction fallback preferences round-trip', () => {
  assert.deepEqual(normalizeCompactionFallbackPreference(true), { enabled: true })
  assert.deepEqual(normalizeCompactionFallbackPreference(false), { enabled: false })
  assert.deepEqual(
    normalizeCompactionFallbackPreference({ compactionFallbackEnabled: true }),
    { enabled: true },
  )
  assert.deepEqual(
    normalizeCompactionFallbackPreference({ compactionFallbackEnabled: false }),
    { enabled: false },
  )
})

test('malformed persisted compaction fallback values default to enabled', () => {
  for (const value of [
    null,
    'false',
    0,
    1,
    [],
    { compactionFallbackEnabled: null },
    { compactionFallbackEnabled: 'false' },
    { compactionFallbackEnabled: 0 },
    { enabled: false },
  ]) {
    assert.deepEqual(normalizeCompactionFallbackPreference(value), { enabled: true })
  }
})

test('setter accepts only booleans and emits only the persisted preference update', () => {
  assert.deepEqual(
    createCompactionFallbackPreferenceUpdate(true),
    { compactionFallbackEnabled: true },
  )
  assert.deepEqual(
    createCompactionFallbackPreferenceUpdate(false),
    { compactionFallbackEnabled: false },
  )

  for (const value of [undefined, null, 'true', 'false', 0, 1, {}, []]) {
    assert.throws(
      () => createCompactionFallbackPreferenceUpdate(value),
      { name: 'TypeError' },
    )
  }
})

test('environment mapping emits exact 1/0 strings without mutating unrelated input', () => {
  const base = { PATH: 'C:\\Windows', UNRELATED: 'preserved' }
  const enabled = applyCompactionFallbackEnv(base, {})
  const disabled = applyCompactionFallbackEnv(base, { compactionFallbackEnabled: false })

  assert.notEqual(enabled, base)
  assert.notEqual(disabled, base)
  assert.deepEqual(base, { PATH: 'C:\\Windows', UNRELATED: 'preserved' })
  assert.deepEqual(enabled, {
    PATH: 'C:\\Windows',
    UNRELATED: 'preserved',
    AGENT_PI_COMPACTION_FALLBACK: '1',
  })
  assert.deepEqual(disabled, {
    PATH: 'C:\\Windows',
    UNRELATED: 'preserved',
    AGENT_PI_COMPACTION_FALLBACK: '0',
  })
})

test('main process uses the pure helper and keeps the persisted bridge narrow', () => {
  const desktop = join(import.meta.dirname, '..')
  const main = readFileSync(join(desktop, 'main.mjs'), 'utf8')

  assert.match(main, /import \{[\s\S]*applyCompactionFallbackEnv[\s\S]*createCompactionFallbackPreferenceUpdate[\s\S]*normalizeCompactionFallbackPreference[\s\S]*\} from '\.\/compaction-preferences\.mjs'/)
  assert.match(main, /function runtimeEnv\(\)[\s\S]*applyCompactionFallbackEnv\([\s\S]*readPrefs\(\)/)
  assert.match(main, /const next = \{ \.\.\.readPrefs\(\), \.\.\.patch \}/)
  assert.match(
    main,
    /ipcMain\.handle\('compaction-fallback-status',[\s\S]*?normalizeCompactionFallbackPreference\(readPrefs\(\)\)[\s\S]*?\)\)/,
  )
  assert.match(
    main,
    /ipcMain\.handle\('set-compaction-fallback',[\s\S]*?createCompactionFallbackPreferenceUpdate\(enabled\)[\s\S]*?writePrefs\(update\)[\s\S]*?return \{ enabled: update\.compactionFallbackEnabled, restartRequired: true \}/,
  )
  assert.doesNotMatch(main, /return\s+writePrefs\(/)
  assert.doesNotMatch(main, /return\s+readPrefs\(/)
})

test('sandboxed preload exposes only the two narrow compaction preference operations', async () => {
  const desktop = join(import.meta.dirname, '..')
  const source = readFileSync(join(desktop, 'preload.cjs'), 'utf8')
  const exposed = {}
  const invocations = []

  runInNewContext(source, {
    require(specifier) {
      assert.equal(specifier, 'electron')
      return {
        contextBridge: {
          exposeInMainWorld(name, value) { exposed[name] = value },
        },
        ipcRenderer: {
          invoke(channel, ...args) {
            invocations.push([channel, ...args])
            return Promise.resolve(channel === 'compaction-fallback-status'
              ? { enabled: true }
              : { enabled: args[0], restartRequired: true })
          },
          on() {},
          removeListener() {},
        },
        webUtils: { getPathForFile() { return '' } },
      }
    },
  })

  const bridge = exposed.agentPiDesktop
  assert.equal(typeof bridge.compactionFallbackStatus, 'function')
  assert.equal(typeof bridge.setCompactionFallback, 'function')
  assert.equal('ipcRenderer' in bridge, false)
  assert.equal('invoke' in bridge, false)

  assert.deepEqual(await bridge.compactionFallbackStatus(), { enabled: true })
  assert.deepEqual(await bridge.setCompactionFallback(false), {
    enabled: false,
    restartRequired: true,
  })
  assert.deepEqual(invocations, [
    ['compaction-fallback-status'],
    ['set-compaction-fallback', false],
  ])
})

test('desktop builder and runtime payload include the helper exactly once', () => {
  const desktop = join(import.meta.dirname, '..')
  const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'))
  const payload = readFileSync(join(desktop, '..', '..', 'scripts', 'pack-runtime-payload.mjs'), 'utf8')

  assert.equal(
    manifest.build.files.filter((entry) => entry === 'compaction-preferences.mjs').length,
    1,
  )
  assert.equal(payload.match(/['"]compaction-preferences\.mjs['"]/g)?.length ?? 0, 1)
})
