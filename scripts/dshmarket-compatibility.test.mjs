import assert from 'node:assert/strict'
import { linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import {
  inspectKnownPluginCompatibility,
  prepareKnownPluginCompatibility,
  reconcileKnownPluginCompatibility,
} from '../vendor/dshmarket/compatibility.js'
import { verifyActivation } from '../vendor/dshmarket/src/verify.ts'

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function profileFixture(t, { version = '4.0.0', source, bundles = ['@xmanrui/dsh-im'] } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'agent-pi-dshmarket-compat-'))
  t.after(() => rmSync(profile, { recursive: true, force: true }))
  const plugin = join(profile, 'node_modules/@xmanrui/dsh-im')
  write(join(plugin, 'package.json'), `${JSON.stringify({
    name: '@xmanrui/dsh-im',
    version,
    main: './lib/index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
  })}\n`)
  write(join(plugin, 'cordis.patch.yml'), "- insert:\n    - id: xmanrui-dsh-im\n      name: '@xmanrui/dsh-im'\n")
  write(join(plugin, 'lib/index.js'), source ?? 'const modern=typeof f?.typertGateway?.stream=="function";\n')
  write(join(profile, 'package.json'), `${JSON.stringify({
    dependencies: { '@xmanrui/dsh-im': `^${version}` },
    dsh: { profile: { bundles } },
  })}\n`)
  return { profile, plugin }
}

test('dsh-im v4 compatibility preparation switches capability detection to ctx.get', (t) => {
  const { profile, plugin } = profileFixture(t)
  const storeEntry = join(profile, 'pnpm-store-dsh-im-index.js')
  linkSync(join(plugin, 'lib/index.js'), storeEntry)
  const before = inspectKnownPluginCompatibility(profile, '@xmanrui/dsh-im')
  assert.equal(before.status, 'repairable')

  const prepared = prepareKnownPluginCompatibility(profile, '@xmanrui/dsh-im')
  assert.equal(prepared.status, 'compatible')
  assert.equal(prepared.changed, true)
  const runtime = readFileSync(join(plugin, 'lib/index.js'), 'utf8')
  assert.match(runtime, /get\?\.\(["']typertGateway["']\)/)
  assert.doesNotMatch(runtime, /typeof [A-Za-z_$][\w$]*\?\.typertGateway\?\.stream/)
  assert.match(readFileSync(storeEntry, 'utf8'), /typeof f\?\.typertGateway\?\.stream/)
  assert.notEqual(readFileSync(storeEntry, 'utf8'), runtime)

  const again = prepareKnownPluginCompatibility(profile, '@xmanrui/dsh-im')
  assert.equal(again.status, 'compatible')
  assert.equal(again.changed, false)
})

test('prepared v4 selects Typert session/workspace services instead of apiProxy', async (t) => {
  const { profile, plugin } = profileFixture(t, {
    source: `export async function apply(ctx) {
  const modern = typeof ctx?.typertGateway?.stream == "function"
  await ctx.inject(modern ? ["sessionController", "workspaceController"] : ["apiProxy"], () => {})
}\n`,
  })
  const prepared = prepareKnownPluginCompatibility(profile, '@xmanrui/dsh-im')
  assert.equal(prepared.status, 'compatible')
  const runtimePath = join(plugin, 'lib/index.js')
  const runtime = await import(`${pathToFileURL(runtimePath).href}?compat=${Date.now()}`)
  const calls = []
  const gateway = { stream() {} }
  await runtime.apply({
    get(name) { return name === 'typertGateway' ? gateway : undefined },
    inject(dependencies) { calls.push(dependencies) },
  })
  assert.deepEqual(calls, [['sessionController', 'workspaceController']])
})

test('compatibility reconciliation adds v4 to bundles and removes incompatible v3', (t) => {
  const v4 = profileFixture(t, { bundles: [] })
  const v4Result = reconcileKnownPluginCompatibility(v4.profile, '@xmanrui/dsh-im')
  assert.equal(v4Result.status, 'compatible')
  const v4Manifest = JSON.parse(readFileSync(join(v4.profile, 'package.json'), 'utf8'))
  assert.deepEqual(v4Manifest.dsh.profile.bundles, ['@xmanrui/dsh-im'])

  const v3 = profileFixture(t, { version: '3.2.0', bundles: ['@xmanrui/dsh-im'] })
  const v3Result = reconcileKnownPluginCompatibility(v3.profile, '@xmanrui/dsh-im')
  assert.equal(v3Result.status, 'incompatible')
  const v3Manifest = JSON.parse(readFileSync(join(v3.profile, 'package.json'), 'utf8'))
  assert.deepEqual(v3Manifest.dsh.profile.bundles, [])
})

test('dsh-im v3 remains incompatible and is not described as absent from the profile layer', (t) => {
  const { profile } = profileFixture(t, { version: '3.2.0', bundles: [] })
  const result = inspectKnownPluginCompatibility(profile, '@xmanrui/dsh-im')
  assert.equal(result.status, 'incompatible')

  const activation = verifyActivation('tender', '@xmanrui/dsh-im', new Set(), profile)
  assert.equal(activation.state, 'inert')
  assert.match(activation.reasons.join(' '), /不兼容|incompatible/i)
  assert.doesNotMatch(activation.reasons.join(' '), /未成为 profile|not a profile-layer/i)
})

test('client-only plugins are compatible and honestly reported as pending restart', (t) => {
  const profile = mkdtempSync(join(tmpdir(), 'agent-pi-dshmarket-client-only-'))
  t.after(() => rmSync(profile, { recursive: true, force: true }))
  const plugin = join(profile, 'node_modules/example-client')
  write(join(plugin, 'package.json'), `${JSON.stringify({
    name: 'example-client',
    version: '1.0.0',
    main: './index.js',
    dsh: { client: { platform: 'web' } },
  })}\n`)
  write(join(plugin, 'index.js'), 'export {}\n')
  write(join(profile, 'package.json'), `${JSON.stringify({
    dependencies: { 'example-client': '^1.0.0' },
    dsh: { profile: { bundles: [] } },
  })}\n`)

  const activation = verifyActivation('tender', 'example-client', new Set(), profile)
  assert.equal(activation.state, 'restart')
  assert.match(activation.reasons.join(' '), /待重启|next boot/i)
})

test('market labels expose compatible, incompatible, and pending-restart states', () => {
  const locales = readFileSync(new URL('../vendor/dshmarket/src/client/locales.ts', import.meta.url), 'utf8')
  assert.match(locales, /stateLive:\s*'兼容（已生效）'/)
  assert.match(locales, /stateRestart:\s*'兼容，待重启'/)
  assert.match(locales, /stateInert:\s*'不兼容'/)
  assert.doesNotMatch(locales, /已安装但未成为 profile 层/)
  const compiled = readFileSync(new URL('../vendor/dshmarket/client/client.js', import.meta.url), 'utf8')
  assert.match(compiled, /stateLive: "兼容（已生效）"/)
  assert.match(compiled, /stateRestart: "兼容，待重启"/)
  assert.match(compiled, /stateInert: "不兼容"/)
  assert.doesNotMatch(compiled, /已安装但未成为 profile 层/)
})

test('profile initialization prepares v4 before applying the bundle filter', () => {
  const init = readFileSync(new URL('./init-tender-profile.mjs', import.meta.url), 'utf8')
  assert.match(init, /prepareKnownPluginCompatibility/)
  assert.doesNotMatch(init, /return name === DSH_IM_NAME/)
})
