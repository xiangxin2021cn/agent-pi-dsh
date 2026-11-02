import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { deriveDistributionInputs, distributionPolicy } from './dsh-distribution-policy.mjs'

const workflow = readFileSync(new URL('../.github/workflows/build-desktop-assets.yml', import.meta.url), 'utf8')

test('3.8.8 and 3.8.7 select the audited Node without changing older releases', () => {
  const expression = workflow.match(/      NODE_RUNTIME_VERSION: \$\{\{ ([^\n]+) \}\}/)?.[1]
  assert.ok(expression)
  for (const [tag, expected] of [['v3.8.8', '24.22.2'], ['v3.8.7', '24.22.2'], ['v3.8.6', '24.22.1'], ['v3.8.5', '24.22.1']]) {
    assert.equal(vm.runInNewContext(expression, { inputs: { tag } }), expected)
  }
})

test('3.8.8 maintenance workflows check out application scripts from the immutable tag', () => {
  const expression = workflow.match(/          ref: \$\{\{ ([^\n]+) \}\}/)?.[1]
  assert.ok(expression)
  for (const tag of ['v3.8.8', 'v3.8.7']) assert.equal(vm.runInNewContext(expression, { inputs: { tag }, github: { sha: 'maintenance' } }), tag)
  assert.equal(vm.runInNewContext(expression, { inputs: { tag: 'v3.8.6' }, github: { sha: 'workflow' } }), 'workflow')
  assert.match(workflow, /elif \[ "\$RELEASE_TAG" = v3\.8\.8 \]; then\r?\n\s+git merge-base --is-ancestor "\$RELEASE_COMMIT" "\$GITHUB_SHA"\r?\n\s+git diff --name-status --no-renames -z "\$RELEASE_COMMIT" "\$GITHUB_SHA" -- > maintenance-changes-388\.paths/)
})

function gate(t) {
  const root = mkdtempSync(join(tmpdir(), 'ap-release-388-'))
  t.after(() => {
    assert.ok(dirname(root) === tmpdir() && basename(root).startsWith('ap-release-388-'))
    rmSync(root, { recursive: true, force: true })
  })
  const source = workflow.slice(workflow.indexOf('- name: Verify immutable release ref')).match(/<<'NODE'\r?\n([\s\S]+?)\r?\n          NODE/)?.[1]
  assert.ok(source)
  writeFileSync(join(root, 'gate.mjs'), source.replace(/^          /gm, ''))
  const commit = '28888149e1249661945e17c29d9baf8a725712e1'
  const base = { RELEASE_TAG: 'v3.8.8', RELEASE_COMMIT: commit, CHECKOUT_COMMIT: commit, GITHUB_SHA: commit, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v3.8.8', MACOS_ONLY: 'false', NODE_RUNTIME_VERSION: '24.22.2' }
  const run = change => spawnSync(process.execPath, [join(root, 'gate.mjs')], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...base, ...change } })
  return { root, run }
}

test('3.8.8 accepts its exact application tag and refuses changed source or runtime', t => {
  const { run } = gate(t)
  assert.equal(run({}).status, 0)
  for (const change of [{ RELEASE_COMMIT: 'a'.repeat(40) }, { CHECKOUT_COMMIT: 'b'.repeat(40) }, { GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_REF_NAME: 'v3.8.7' }, { NODE_RUNTIME_VERSION: '24.22.1' }]) {
    assert.notEqual(run(change).status, 0)
  }
})

test('3.8.8 main maintenance permits exactly the two reviewed modified paths', t => {
  const { root, run } = gate(t), file = join(root, 'maintenance-changes-388.paths')
  const maintenance = { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main', GITHUB_SHA: 'b'.repeat(40) }
  const allowed = ['M', '.github/workflows/build-desktop-assets.yml', 'M', 'scripts/platform-release-388.test.mjs']
  const changes = rows => writeFileSync(file, rows.join('\0') + '\0')
  changes(allowed)
  assert.equal(run(maintenance).status, 0)
  assert.notEqual(run({ ...maintenance, GITHUB_REF_NAME: 'other' }).status, 0)
  assert.notEqual(run({ ...maintenance, CHECKOUT_COMMIT: maintenance.GITHUB_SHA }).status, 0)
  for (const rows of [[], ['M', '.github/workflows/build-desktop-assets.yml'], ['A', allowed[1], ...allowed.slice(2)], [...allowed, 'M', 'package.json'], [...allowed, 'M', 'website/index.html'], ['R100', allowed[1], allowed[3]]]) {
    changes(rows)
    assert.notEqual(run(maintenance).status, 0, JSON.stringify(rows))
  }
})

test('policy install and seal CLI boundaries receive quoted absolute roots', () => {
  assert.ok(workflow.includes('dsh-distribution-policy.mjs install "$PWD" "$PWD/../product" "$RUNNER_TEMP/agent-pi-selected-dsh"'))
  assert.ok(workflow.includes('dsh-distribution-policy.mjs seal "$PWD/payload/deepseek-harness" "$PWD/payload/product"'))
})

test('real distribution policy reproduces the relative createRequire failure and accepts absolute roots', t => {
  const root = mkdtempSync(join(tmpdir(), 'ap-release-388-policy-'))
  t.after(() => {
    assert.ok(dirname(root) === tmpdir() && basename(root).startsWith('ap-release-388-policy-'))
    rmSync(root, { recursive: true, force: true })
  })
  const dsh = join(root, 'dsh'), product = join(root, 'product'), sourceRequire = createRequire(new URL('../bundles/tender-host/package.json', import.meta.url)), yaml = sourceRequire('js-yaml')
  const write = (path, content) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content) }
  write(join(product, 'bundles/tender-host/package.json'), '{"name":"isolated-policy-host"}\n')
  write(join(product, 'DSH_PIN'), distributionPolicy.sourceCommit + '\n')
  for (const name of ['js-yaml', 'argparse']) cpSync(dirname(sourceRequire.resolve(name + '/package.json')), join(product, 'bundles/tender-host/node_modules', name), { recursive: true })
  const importers = {}
  for (const [path, name] of [['.', 'isolated-dsh'], ...Object.entries(distributionPolicy.excludedWorkspaces), ...distributionPolicy.requiredWorkspaces.map((path, index) => [path, 'isolated-oar-' + index])]) {
    write(join(dsh, path, 'package.json'), JSON.stringify({ name, version: '1.0.0' }) + '\n')
    importers[path] = {}
  }
  write(join(dsh, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  write(join(dsh, 'pnpm-lock.yaml'), yaml.dump({ lockfileVersion: '9.0', importers, packages: {}, snapshots: {} }, { lineWidth: -1 }))
  write(join(dsh, 'DSH-BUILD-RECEIPT.json'), '{"isolated":true}\n')
  const protectedFiles = [join(dsh, 'pnpm-lock.yaml'), join(dsh, 'pnpm-workspace.yaml'), join(dsh, 'DSH-BUILD-RECEIPT.json'), join(product, 'DSH_PIN')]
  const hashes = () => protectedFiles.map(path => createHash('sha256').update(readFileSync(path)).digest('hex')), before = hashes()
  assert.throws(() => deriveDistributionInputs(dsh, relative(process.cwd(), product)), { code: 'ERR_INVALID_ARG_VALUE' })
  const inputs = deriveDistributionInputs(dsh, product)
  assert.equal(inputs.receipt.source.commit, distributionPolicy.sourceCommit)
  assert.deepEqual(Object.keys(yaml.load(inputs.lock).importers), Object.keys(importers).filter(path => !(path in distributionPolicy.excludedWorkspaces)))
  assert.deepEqual(hashes(), before)
})
