import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'

const workflow = readFileSync(new URL('../.github/workflows/build-desktop-assets.yml', import.meta.url), 'utf8')

test('3.8.8 and 3.8.7 select the audited Node without changing older releases', () => {
  const expression = workflow.match(/      NODE_RUNTIME_VERSION: \$\{\{ ([^\n]+) \}\}/)?.[1]
  assert.ok(expression)
  for (const [tag, expected] of [['v3.8.8', '24.22.2'], ['v3.8.7', '24.22.2'], ['v3.8.6', '24.22.1'], ['v3.8.5', '24.22.1']]) {
    assert.equal(vm.runInNewContext(expression, { inputs: { tag } }), expected)
  }
})

test('3.8.8 accepts only its exact immutable tag checkout and rejects branch dispatch', t => {
  const root = mkdtempSync(join(tmpdir(), 'ap-release-388-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = workflow.slice(workflow.indexOf('- name: Verify immutable release ref')).match(/<<'NODE'\r?\n([\s\S]+?)\r?\n          NODE/)?.[1]
  assert.ok(source)
  writeFileSync(join(root, 'gate.mjs'), source.replace(/^          /gm, ''))
  const commit = 'a'.repeat(40)
  const base = { RELEASE_TAG: 'v3.8.8', RELEASE_COMMIT: commit, CHECKOUT_COMMIT: commit, GITHUB_SHA: commit, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v3.8.8', MACOS_ONLY: 'false' }
  const run = change => spawnSync(process.execPath, [join(root, 'gate.mjs')], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...base, ...change } })
  assert.equal(run({}).status, 0)
  for (const change of [{ CHECKOUT_COMMIT: 'b'.repeat(40) }, { GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_REF_NAME: 'v3.8.7' }, { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' }]) {
    assert.notEqual(run(change).status, 0)
  }
})
