import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { productionRuntimeManifest, runtimeDependenciesReady } from './install-univer-runtime-deps.mjs'

const script = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'init-tender-profile.mjs'), 'utf8')
const workflow = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../.github/workflows/build-desktop-assets.yml'), 'utf8')

test('Univer runtime install resolves only production dependencies in a clean staging folder', () => {
  assert.deepEqual(productionRuntimeManifest({
    name: 'dsh-univer-office',
    dependencies: { public: '1.0.0' },
    devDependencies: { insiders: '0.0.0-insiders' },
  }), {
    name: 'agent-pi-univer-runtime',
    private: true,
    dependencies: { public: '1.0.0' },
  })
  assert.match(script, /installUniverRuntimeDeps\(univerDir/)
  assert.match(workflow, /install-univer-runtime-deps\.mjs payload\/product\/vendor\/dsh-univer-office/)
})

test('Univer readiness requires every production package', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '.tmp-univer-ready')
  assert.equal(runtimeDependenciesReady(root, { a: '1', '@scope/b': '2' }), false)
})
