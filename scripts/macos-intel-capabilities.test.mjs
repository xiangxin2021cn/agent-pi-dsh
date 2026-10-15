import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { macOSIntelCapabilitiesPatch, writeMacOSIntelCapabilities } from './macos-intel-capabilities.mjs'
import { inspectKnownPluginCompatibility, reconcileKnownPluginCompatibility, VOICE_INPUT_PACKAGE, NATIVE_CUA_PACKAGE } from '../vendor/dshmarket/compatibility.js'

const product = fileURLToPath(new URL('..', import.meta.url))
const dshRoot = process.env.AGENT_PI_TEST_DSH_ROOT || join(product, 'vendor/deepseek-harness')
const { entryListSchema, applyEntryPatches } = await import(pathToFileURL(join(dshRoot, 'vendor/include/lib/index.js')).href)
const yaml = createRequire(join(dshRoot, 'vendor/include/package.json'))('js-yaml')
const native = '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
const claude = '@deepseek-ai/dsh-subagent-claude-code'
const voice = ['speech-to-text', 'speech-to-text-sensevoice', 'api-speech-to-text', 'ui-voice-input']

function fixture(t, marked = true) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-intel-capabilities-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const productRoot = join(root, 'product'), home = join(root, 'home')
  mkdirSync(productRoot, { recursive: true })
  if (marked) writeFileSync(join(productRoot, 'MACOS-INTEL-MONTEREY.json'), '{}\n')
  return { productRoot, home, dshRoot }
}

test('ordinary distributions do not inspect or write compatibility configuration', async t => {
  const options = fixture(t, false)
  const spawn = t.mock.method(childProcess, 'spawnSync', () => { throw new Error('must not run') })
  assert.equal(macOSIntelCapabilitiesPatch(options.productRoot, options.home), null)
  assert.equal(await writeMacOSIntelCapabilities(options), null)
  assert.equal(spawn.mock.callCount(), 0)
  assert.equal(existsSync(options.home), false)
})

test('marker-based market rules disable optional bundle membership while retaining dependencies and settings', t => {
  const options = fixture(t)
  const previous = process.env.DSH_BUNDLED_SKILL_DIR
  process.env.DSH_BUNDLED_SKILL_DIR = join(options.productRoot, 'skills')
  t.after(() => { if (previous === undefined) delete process.env.DSH_BUNDLED_SKILL_DIR; else process.env.DSH_BUNDLED_SKILL_DIR = previous })
  const profile = join(options.home, 'profiles/tender')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { [VOICE_INPUT_PACKAGE]: '0.2.1-alpha.2' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', VOICE_INPUT_PACKAGE, '@office/fixture'] } } }))
  const saved = '- id: speech-to-text-sensevoice\n  config:\n    dataRoot: /existing-models\n'
  writeFileSync(join(profile, 'cordis.patch.yml'), saved)
  for (const name of [VOICE_INPUT_PACKAGE, NATIVE_CUA_PACKAGE]) {
    const status = inspectKnownPluginCompatibility(profile, name)
    assert.equal(status.status, 'incompatible')
    assert.match(status.reason, /兼容分发不提供/)
  }
  reconcileKnownPluginCompatibility(profile, VOICE_INPUT_PACKAGE)
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@office/fixture'])
  assert.equal(manifest.dependencies[VOICE_INPUT_PACKAGE], '0.2.1-alpha.2')
  assert.equal(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8'), saved)
  rmSync(join(options.productRoot, 'MACOS-INTEL-MONTEREY.json'))
  for (const name of [VOICE_INPUT_PACKAGE, NATIVE_CUA_PACKAGE]) assert.equal(inspectKnownPluginCompatibility(profile, name).status, 'irrelevant')
})

test('private dump capture isolates arbitrary native IDs, including groups, without copying configuration', async t => {
  const options = fixture(t)
  const secret = 'fixture-secret-must-not-be-written'
  const spawn = t.mock.method(childProcess, 'spawnSync', (_command, args, config) => {
    assert.deepEqual(args.slice(-3), ['--profile', 'tender', '--dump-config'])
    assert.deepEqual(config.stdio, ['ignore', 'pipe', 'pipe'])
    assert.equal(config.env.DSH_HOME, options.home)
    return { status: 0, stdout: yaml.dump([
      { id: 'custom-native-id', name: native, config: { key: secret } },
      { id: 'group', group: true, config: [{ id: 'other-native-id', name: native }] },
      { id: 'custom-claude-id', name: claude, config: { key: secret } },
      { id: 'univer', name: '@office/fixture', config: { token: secret } },
    ]), stderr: secret }
  })
  const result = await writeMacOSIntelCapabilities(options)
  assert.equal(spawn.mock.callCount(), 1)
  assert.equal(result.nativeEntries, 3)
  const text = readFileSync(result.patchPath, 'utf8')
  assert.equal(text.includes(secret), false)
  const rows = yaml.load(text)
  assert.deepEqual(rows.slice(0, 4), voice.map(id => ({ id, disabled: true })))
  assert.deepEqual(rows.slice(4), [
    ...['custom-native-id', 'other-native-id'].map(id => ({ id, name: native, disabled: true })),
    { id: 'custom-claude-id', name: claude, disabled: true },
  ])
})

test('failed or malformed dumps never expose captured credentials in thrown errors', async t => {
  const options = fixture(t)
  const secret = 'fixture-sensitive-output'
  const spawn = t.mock.method(childProcess, 'spawnSync', () => ({ status: 1, stdout: secret, stderr: secret, error: new Error(secret) }))
  await assert.rejects(writeMacOSIntelCapabilities(options), error => !String(error).includes(secret))
  spawn.mock.mockImplementation(() => ({ status: 0, stdout: 'invalid: [ ' + secret, stderr: secret }))
  await assert.rejects(writeMacOSIntelCapabilities(options), error => !String(error).includes(secret))
  assert.equal(existsSync(macOSIntelCapabilitiesPatch(options.productRoot, options.home)), false)
})

test('fixed voice rows remain disabled when enabled later through the official patch composer', async t => {
  const options = fixture(t)
  t.mock.method(childProcess, 'spawnSync', () => ({ status: 0, stdout: '[]\n' }))
  const { patchPath } = await writeMacOSIntelCapabilities(options)
  const overlay = yaml.load(readFileSync(patchPath, 'utf8'))
  const base = [{ id: 'agent-loop', name: 'core-loop', config: { keep: true } }]
  const rows = applyEntryPatches(base, [
    { insert: voice.map(id => ({ id, name: 'fixture-' + id, disabled: false })) },
    ...voice.map(id => ({ id, disabled: false })), ...overlay,
  ], () => {})
  assert.deepEqual(rows[0], base[0])
  for (const id of voice) assert.equal(rows.find(row => row.id === id).disabled, true)
})

test('real official dump preserves profile/home files, !!js and core providers under launcher isolation', async t => {
  const options = fixture(t)
  const profile = join(options.home, 'profiles/tender')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }))
  const nativeId = 'user-chosen-native-cua-id'
  const claudeId = 'user-chosen-claude-id'
  const config = '- insert:\n' + yaml.dump([
    ...voice.map(id => ({ id, name: 'fixture-' + id, disabled: false })),
    { id: nativeId, name: native, config: { secret: 'do-not-copy-this' } },
    { id: claudeId, name: claude, config: { secret: 'do-not-copy-this' } },
    ...['agent-loop', 'agent-pi-subagent-codex', 'univer'].map(id => ({ id, name: 'fixture-' + id, config: { unchanged: true } })),
  ]).split('\n').filter(Boolean).map(line => '  ' + line).join('\n') + '\n'
  const profilePatch = join(profile, 'cordis.patch.yml')
  const homePatch = join(options.home, 'cordis.patch.yml')
  writeFileSync(profilePatch, config)
  writeFileSync(homePatch, `- id: ${nativeId}\n  disabled: false\n  config:\n    token: do-not-copy-this\n    expression: !!js globalThis.notExecuted = true\n`)
  const { patchPath } = await writeMacOSIntelCapabilities(options)
  const result = childProcess.spawnSync(process.execPath, [join(dshRoot, 'apps/cli/lib/bin.js'), '--profile', 'tender', '--patch', patchPath, '--dump-config'], {
    cwd: dshRoot, env: { ...process.env, DSH_HOME: options.home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  })
  assert.equal(result.status, 0, 'Official composition with compatibility overlay must succeed')
  const rows = yaml.load(result.stdout, { schema: entryListSchema })
  for (const id of [...voice, nativeId, claudeId]) assert.equal(rows.find(row => row.id === id).disabled, true)
  for (const id of ['agent-loop', 'agent-pi-subagent-codex', 'univer']) {
    const row = rows.find(row => row.id === id)
    assert.equal(row.disabled, undefined)
    assert.deepEqual(row.config, { unchanged: true })
  }
  assert.equal(rows.find(row => row.id === nativeId).config.expression.__jsExpr, 'globalThis.notExecuted = true')
  assert.equal(readFileSync(profilePatch, 'utf8'), config)
  assert.equal(readFileSync(homePatch, 'utf8').includes('disabled: false'), true)
  assert.equal(readFileSync(patchPath, 'utf8').includes('do-not-copy-this'), false)
  assert.equal(globalThis.notExecuted, undefined)
})

test('desktop launcher places the compatibility overlay before app flags on both launch paths', () => {
  const source = readFileSync(join(product, 'apps/desktop/main.mjs'), 'utf8')
  const functionSource = source.slice(source.indexOf('function dshProfileArgs('), source.indexOf('\nfunction dshArgs('))
  for (const enabled of [false, true]) {
    const context = { macosIntelCompatibility: enabled, dshHome: '/fixture-home', join }
    vm.runInNewContext(functionSource + '\nresult = dshProfileArgs(["--port", "12345"])', context)
    assert.deepEqual(Array.from(context.result), ['--profile', 'tender', ...enabled ? ['--patch', join('/fixture-home', '.agent-pi-presets/macos-intel-compat.patch.yml')] : [], '--no-open', '--port', '12345'])
  }
  assert.match(source, /const args = dshProfileArgs\(extra\)/)
  assert.match(source, /spawn\(pnpm, \['dsh', \.\.\.dshProfileArgs\(extra\)\]/)
  assert.match(source, /createCodexExecutionController\(\{[\s\S]*?\n    macosIntelCompatibility,/)
})
