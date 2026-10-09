import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../../..')
const dsh = resolve(root, 'vendor/deepseek-harness')

for (const [wrapper, official, name, inject, hasConfig] of [
  ['goal-round-driver', 'goal/goal-round-driver', 'agent-pi-goal-round-driver', ['agents', 'goals', 'sessions'], false],
  ['codex-provider', 'subagent/subagent-codex', 'agent-pi-codex-provider', ['subagents', 'subprocess'], true],
]) {
  test(wrapper + ' imports the compiled official plugin in native Node strip-only mode', () => {
    const wrapperUrl = pathToFileURL(resolve(root, 'bundles/tender-host/src', wrapper + '.ts')).href
    const officialUrl = pathToFileURL(resolve(dsh, 'packages', official, 'lib/index.js')).href
    const source = `
      import assert from 'node:assert/strict'
      const wrapper = await import(${JSON.stringify(wrapperUrl)})
      const official = await import(${JSON.stringify(officialUrl)})
      assert.equal(wrapper.name, ${JSON.stringify(name)})
      assert.equal(typeof wrapper.apply, 'function')
      assert.deepEqual(wrapper.inject, ${JSON.stringify(inject)})
      assert.equal(wrapper.inject, official.inject)
      assert.equal(wrapper.Config, official.Config)
      assert.equal(typeof wrapper.Config, ${JSON.stringify(hasConfig ? 'function' : 'undefined')})
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: '', DSH_CHECKOUT: dsh },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    })
    assert.equal(result.status, 0, result.error?.stack || result.stderr || result.stdout)
  })
}
