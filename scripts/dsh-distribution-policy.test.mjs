import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { deriveDistributionInputs, distributionPolicy, distributionReceipt, installedPackageInventory, prepareDistributionWorkspace, projectDistributionModules, stageDistributionManifests, verifyDistributionRuntime, verifySelectedProfile, verifySelectedProfileFile } from './dsh-distribution-policy.mjs'
import { verifyDependencyClosure } from './verify-runtime-dependencies.mjs'

const sourceRequire = createRequire(new URL('../bundles/tender-host/package.json', import.meta.url))
const yaml = sourceRequire('js-yaml')
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
function write(path, content) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content) }
function json(path, value) { write(path, JSON.stringify(value) + '\n') }
function link(target, path) { mkdirSync(dirname(path), { recursive: true }); symlinkSync(process.platform === 'win32' ? target : relative(dirname(path), target), path, process.platform === 'win32' ? 'junction' : 'dir') }
function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-selected-production-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const dsh = join(home, 'dsh'), product = join(home, 'product'), install = join(home, 'install')
  json(join(product, 'package.json'), { agentPiProduct: { edition: 'mainline' } })
  json(join(product, 'bundles/tender-host/package.json'), { name: 'fixture-host' })
  write(join(product, 'DSH_PIN'), distributionPolicy.sourceCommit + '\n')
  for (const name of ['js-yaml', 'argparse']) {
    const source = dirname(sourceRequire.resolve(name + '/package.json'))
    cpSync(source, join(product, 'bundles/tender-host/node_modules', name), { recursive: true })
  }
  const importers = {}
  for (const [path, name] of [['.', 'fixture-dsh'], ['apps/cli', 'fixture-cli'], ...Object.entries(distributionPolicy.excludedWorkspaces),
    ...distributionPolicy.requiredWorkspaces.map((path, index) => [path, 'fixture-oar-' + index])]) {
    json(join(dsh, path, 'package.json'), { name, version: '1.0.0' })
    importers[path] = {}
  }
  for (const path of distributionPolicy.requiredWorkspaces) write(join(dsh, path, 'lib/index.js'), 'export {}\n')
  write(join(dsh, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n  - apps/*\n')
  write(join(dsh, 'pnpm-lock.yaml'), yaml.dump({ lockfileVersion: '9.0', importers, packages: { '@openai/codex@1': { resolution: { integrity: 'sha512-original' } } }, snapshots: { '@openai/codex@1': {} } }, { lineWidth: -1 }))
  json(join(dsh, 'DSH-BUILD-RECEIPT.json'), { original: 'immutable' })
  return { home, dsh, product, install }
}

test('install-only transform excludes exactly the two inactive importers and retains upstream source/integrity', t => {
  const { dsh, product, install } = fixture(t)
  const protectedFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'DSH-BUILD-RECEIPT.json']
  const before = protectedFiles.map(path => hash(join(dsh, path)))
  const original = yaml.load(readFileSync(join(dsh, 'pnpm-lock.yaml'), 'utf8'))
  const receipt = prepareDistributionWorkspace(dsh, product, install)
  const derived = yaml.load(readFileSync(join(install, 'pnpm-lock.yaml'), 'utf8'))
  assert.deepEqual(Object.keys(derived.importers), Object.keys(original.importers).filter(path => !(path in distributionPolicy.excludedWorkspaces)))
  assert.deepEqual(derived.packages, original.packages)
  assert.deepEqual(derived.snapshots, original.snapshots)
  assert.ok(yaml.load(readFileSync(join(install, 'pnpm-workspace.yaml'), 'utf8')).packages.includes('!packages/subagent/subagent-codex'))
  assert.deepEqual(protectedFiles.map(path => hash(join(dsh, path))), before)
  assert.equal(receipt.source.commit, distributionPolicy.sourceCommit)
  assert.throws(() => prepareDistributionWorkspace(dsh, product, install), /new directory/)
})

test('an active importer may not silently lose a direct, optional or peer dependency', async t => {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) await t.test(field, t => {
    const { dsh, product } = fixture(t)
    json(join(dsh, 'apps/cli/package.json'), { [field]: { '@openai/codex': '1' } })
    assert.throws(() => deriveDistributionInputs(dsh, product), /Active importer still requires excluded runtime/)
  })
})

test('actual projected node_modules resolve inside the final runtime and seal rejects reintroduced CLI/SDKs', t => {
  const { dsh, product, install } = fixture(t)
  const protectedFiles = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'DSH-BUILD-RECEIPT.json']
  const before = protectedFiles.map(path => hash(join(dsh, path)))
  prepareDistributionWorkspace(dsh, product, install)
  json(join(install, 'node_modules/.pnpm/oar-js@1/node_modules/oar-js/package.json'), { name: 'oar-js', version: '1' })
  write(join(install, 'node_modules/.pnpm/oar-js@1/node_modules/oar-js/index.js'), 'module.exports = 7\n')
  const oar = distributionPolicy.requiredWorkspaces[0]
  // This is the actual package layout emitted by a pnpm install, not a text assertion.
  link(join(install, 'node_modules/.pnpm/oar-js@1/node_modules/oar-js'), join(install, oar, 'node_modules/oar-js'))
  projectDistributionModules(install, dsh)
  const require = createRequire(join(dsh, oar, 'package.json'))
  assert.equal(require('oar-js'), 7)
  assert.ok(realpathSync(require.resolve('oar-js')).startsWith(realpathSync(dsh)))
  assert.deepEqual(protectedFiles.map(path => hash(join(dsh, path))), before)
  assert.ok(existsSync(join(dsh, distributionReceipt)))
  assert.throws(() => verifyDistributionRuntime(dsh, product), /sealed runtime/)
  verifyDistributionRuntime(dsh, product, { seal: true })
  assert.ok(verifyDistributionRuntime(dsh, product).packages > 0)
  rmSync(install, { recursive: true })
  assert.equal(require('oar-js'), 7)
  json(join(dsh, 'node_modules/.pnpm/unexpected/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/package.json'), { name: '@anthropic-ai/claude-agent-sdk-win32-x64', version: '1' })
  assert.throws(() => verifyDistributionRuntime(dsh, product), /Excluded executable\/SDK remains/)
})

test('projection refuses stale dependencies, changed frozen inputs and dependency links escaping the owned workspace', async t => {
  for (const mutation of ['stale', 'changed-lock', 'external-link']) await t.test(mutation, t => {
    const { home, dsh, product, install } = fixture(t)
    prepareDistributionWorkspace(dsh, product, install)
    json(join(install, 'node_modules/valid/package.json'), { name: 'valid', version: '1' })
    if (mutation === 'stale') mkdirSync(join(dsh, 'node_modules'))
    if (mutation === 'changed-lock') write(join(install, 'pnpm-lock.yaml'), 'changed')
    if (mutation === 'external-link') { mkdirSync(join(home, 'outside')); link(join(home, 'outside'), join(install, 'node_modules/outside')) }
    assert.throws(() => projectDistributionModules(install, dsh), /stale runtime dependencies|Frozen distribution install inputs changed|escapes install workspace/)
  })
})

test('source, policy and package inventory are bound to the sealed distribution receipt', t => {
  const { dsh, product, install } = fixture(t)
  prepareDistributionWorkspace(dsh, product, install)
  json(join(install, 'node_modules/oar-js/package.json'), { name: 'oar-js', version: '1' })
  projectDistributionModules(install, dsh)
  verifyDistributionRuntime(dsh, product, { seal: true })
  json(join(dsh, 'node_modules/oar-js/package.json'), { name: 'oar-js', version: '2' })
  assert.throws(() => verifyDistributionRuntime(dsh, product), /inventory differs/)
  write(join(dsh, 'DSH-BUILD-RECEIPT.json'), 'changed upstream receipt')
  assert.throws(() => verifyDistributionRuntime(dsh, product), /receipt mismatch: source/)
})

test('generic OpenAI/Anthropic client libraries remain permitted; active legacy providers fail profile gate', t => {
  const { dsh } = fixture(t)
  for (const name of ['openai', '@anthropic-ai/sdk']) json(join(dsh, 'node_modules', name, 'package.json'), { name, version: '1' })
  assert.equal(installedPackageInventory(dsh).length, 2)
  assert.doesNotThrow(() => verifySelectedProfile([{ name: 'dsh-tender-host' }, { name: '@deepseek-ai/dsh-experimental-subagent-oar', config: { runtime: 'codex' } }]))
  assert.throws(() => verifySelectedProfile([{ name: 'dsh-tender-host', disabled: true }, { name: '@deepseek-ai/dsh-experimental-tool-subagent-oar' }]), /active product host permission guard/)
  assert.throws(() => verifySelectedProfile([{ name: 'group', config: [{ name: '@deepseek-ai/dsh-subagent-codex' }] }]), /activates an excluded provider/)
  assert.throws(() => verifySelectedProfile([{ name: 'preset', config: { plugins: [{ name: 'codex-provider' }] } }]), /activates an excluded provider/)
})

test('workspace runtime peer imports remain mandatory in the active dependency closure', t => {
  const { dsh } = fixture(t)
  const root = join(dsh, 'apps/cli')
  json(join(root, 'package.json'), { peerDependencies: { '@fixture/required-peer': 'workspace:*' } })
  assert.throws(() => verifyDependencyClosure([root], [dsh]), /required-peer/)
  json(join(root, 'node_modules/@fixture/required-peer/package.json'), { name: '@fixture/required-peer', version: '1' })
  assert.equal(verifyDependencyClosure([root], [dsh]).packages, 2)
  json(join(root, 'package.json'), { dependencies: { '@fixture/direct': '1' }, peerDependencies: { '@fixture/direct': 'workspace:*' }, peerDependenciesMeta: { '@fixture/direct': { optional: true } } })
  assert.throws(() => verifyDependencyClosure([root], [dsh]), /@fixture\/direct/, 'optional peer metadata cannot weaken a required direct dependency')
})

test('final official profile dumps reject excluded active providers while treating expression nodes as data', async t => {
  const { product, home } = fixture(t)
  const dsh = fileURLToPath(new URL('../vendor/deepseek-harness', import.meta.url))
  const file = join(home, 'final-dump.yml')
  write(file, '- id: existing\n  name: fixture\n  config:\n    expression: !!js globalThis.selectedProfileEvaluated = true\n')
  assert.equal((await verifySelectedProfileFile(dsh, product, file)).policy, distributionPolicy.id)
  assert.equal(globalThis.selectedProfileEvaluated, undefined)
  write(file, '- id: group\n  group: true\n  config:\n    - id: legacy\n      name: "@deepseek-ai/dsh-subagent-claude-code"\n')
  await assert.rejects(verifySelectedProfileFile(dsh, product, file), /activates an excluded provider/)
  write(file, '- id: disabled-group\n  disabled: true\n  group: true\n  config:\n    - id: legacy\n      name: "@deepseek-ai/dsh-subagent-codex"\n')
  await assert.doesNotReject(verifySelectedProfileFile(dsh, product, file))
  write(file, 'invalid: [ fixture-secret-do-not-echo')
  await assert.rejects(verifySelectedProfileFile(dsh, product, file), error => !String(error).includes('fixture-secret'))
})

test('curated runtime restores only omitted lock-importer manifests from the actual pinned source', async t => {
  const source = fileURLToPath(new URL('../vendor/deepseek-harness', import.meta.url))
  const lock = yaml.load(readFileSync(join(source, 'pnpm-lock.yaml'), 'utf8'))
  for (const mutation of ['valid', 'changed-lock', 'changed-existing', 'linked-parent']) await t.test(mutation, t => {
    const { dsh, product, home } = fixture(t)
    for (const name of ['pnpm-workspace.yaml', 'pnpm-lock.yaml']) write(join(dsh, name), readFileSync(join(source, name)))
    for (const importer of Object.keys(lock.importers)) {
      if (importer === 'website') continue
      const path = join(importer, 'package.json')
      write(join(dsh, path), readFileSync(join(source, path)))
    }
    const receiptHash = hash(join(dsh, 'DSH-BUILD-RECEIPT.json'))
    if (mutation === 'changed-lock') write(join(dsh, 'pnpm-lock.yaml'), readFileSync(join(dsh, 'pnpm-lock.yaml'), 'utf8') + '\n')
    if (mutation === 'changed-existing') write(join(dsh, 'apps/cli/package.json'), '{}')
    if (mutation === 'linked-parent') { mkdirSync(join(home, 'outside')); link(join(home, 'outside'), join(dsh, 'website')) }
    if (mutation !== 'valid') {
      assert.throws(() => stageDistributionManifests(dsh, product, source), /differs|linked outside/)
      assert.equal(existsSync(join(home, 'outside/package.json')), false)
      assert.equal(hash(join(dsh, 'DSH-BUILD-RECEIPT.json')), receiptHash)
      return
    }
    const result = stageDistributionManifests(dsh, product, source)
    assert.equal(result.checked, 396)
    assert.deepEqual(result.added.map(row => row.path), ['website/package.json'])
    assert.equal(hash(join(dsh, 'website/package.json')), hash(join(source, 'website/package.json')))
    assert.equal(hash(join(dsh, 'pnpm-lock.yaml')), hash(join(source, 'pnpm-lock.yaml')))
    assert.equal(hash(join(dsh, 'DSH-BUILD-RECEIPT.json')), receiptHash)
    assert.deepEqual(stageDistributionManifests(dsh, product, source).added, [])
    const derived = deriveDistributionInputs(dsh, product)
    assert.equal(Object.keys(yaml.load(derived.lock).importers).length, 394)
  })
})
