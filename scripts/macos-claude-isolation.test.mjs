import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { omitMacOSClaudeNative } from './omit-macos-claude-native.mjs'
import {
  CLAUDE_CODE_PACKAGE,
  inspectKnownPluginCompatibility,
  intelMontereyMarketPatch,
  prepareKnownPluginCompatibility,
  reconcileKnownPluginCompatibility,
} from '../vendor/dshmarket/compatibility.js'

const nativeName = '@anthropic-ai/claude-agent-sdk-darwin-x64'

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function fixture(t) {
  const root = mkdtempSync(join(os.tmpdir(), 'agent-pi-macos-claude-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function platform(t, name, arch = 'x64', kernel = '21.6.0') {
  for (const [key, value] of Object.entries({ platform: name, arch })) {
    const descriptor = Object.getOwnPropertyDescriptor(process, key)
    Object.defineProperty(process, key, { ...descriptor, value })
    t.after(() => Object.defineProperty(process, key, descriptor))
  }
  t.mock.method(os, 'release', () => kernel)
}

function profile(t, native = false) {
  const root = fixture(t)
  const provider = join(root, 'node_modules', CLAUDE_CODE_PACKAGE)
  write(join(root, 'package.json'), JSON.stringify({
    dependencies: { [CLAUDE_CODE_PACKAGE]: '0.2.1-alpha.2', dshmarket: '^1.99.0' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', CLAUDE_CODE_PACKAGE, 'dshmarket'] } },
  }))
  write(join(root, 'settings.yaml'), 'account: preserved\n')
  write(join(provider, 'package.json'), JSON.stringify({ name: CLAUDE_CODE_PACKAGE }))
  const sdk = join(provider, 'node_modules/@anthropic-ai/claude-agent-sdk')
  write(join(sdk, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-agent-sdk', main: 'sdk.mjs' }))
  write(join(sdk, 'sdk.mjs'), 'export {}\n')
  if (native) {
    const binary = join(sdk, 'node_modules', nativeName)
    write(join(binary, 'package.json'), JSON.stringify({ name: nativeName, version: '0.3.263' }))
    write(join(binary, 'claude'), 'native fixture\n')
  }
  return root
}

test('Intel compatibility pruning removes only the optional Claude engine and links pointing to it', t => {
  const root = fixture(t)
  write(join(root, 'package.json'), '{"name":"deepseek-harness"}\n')
  write(join(root, 'pnpm-lock.yaml'), 'original lock\n')
  write(join(root, 'DSH-BUILD-RECEIPT.json'), 'original receipt\n')
  write(join(root, 'packages/subagent/subagent-claude-code/src/index.ts'), 'original provider source\n')
  const native = join(root, 'node_modules/.pnpm/native/node_modules', nativeName)
  write(join(native, 'package.json'), JSON.stringify({ name: nativeName, version: '0.3.263' }))
  write(join(native, 'claude'), 'native binary\n')
  const sdk = join(root, 'node_modules/.pnpm/sdk/node_modules/@anthropic-ai/claude-agent-sdk')
  write(join(sdk, 'sdk.mjs'), 'export {}\n')
  const link = join(sdk, 'node_modules', nativeName)
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(process.platform === 'win32' ? native : relative(dirname(link), native), link,
    process.platform === 'win32' ? 'junction' : 'dir')
  const arm = join(root, 'node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')
  write(arm, 'unrelated arm engine\n')
  const codex = join(root, 'node_modules/@openai/codex/cli.js')
  write(codex, 'unchanged Codex\n')
  const cliLink = join(root, 'node_modules/.bin/claude')
  const codexLink = join(root, 'node_modules/.bin/codex')
  mkdirSync(dirname(cliLink), { recursive: true })
  symlinkSync(join(native, 'claude'), cliLink, 'file')
  symlinkSync(codex, codexLink, 'file')
  const result = omitMacOSClaudeNative(root)
  assert.equal(result.removed, 3)
  assert.equal(existsSync(native), false)
  assert.equal(existsSync(link), false)
  assert.equal(existsSync(cliLink), false)
  assert.equal(readFileSync(codexLink, 'utf8'), 'unchanged Codex\n')
  assert.equal(readFileSync(join(sdk, 'sdk.mjs'), 'utf8'), 'export {}\n')
  assert.equal(readFileSync(arm, 'utf8'), 'unrelated arm engine\n')
  assert.equal(readFileSync(codex, 'utf8'), 'unchanged Codex\n')
  assert.equal(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'), 'original lock\n')
  assert.equal(readFileSync(join(root, 'DSH-BUILD-RECEIPT.json'), 'utf8'), 'original receipt\n')
  assert.equal(readFileSync(join(root, 'packages/subagent/subagent-claude-code/src/index.ts'), 'utf8'), 'original provider source\n')
  assert.equal(omitMacOSClaudeNative(root).removed, 0)
})

test('Monterey disables an already-installed Claude engine and retains plugin configuration', t => {
  const root = profile(t, true)
  platform(t, 'darwin')
  const status = inspectKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE)
  assert.equal(status.status, 'incompatible')
  assert.match(status.reason, /macOS 13/)
  assert.equal(prepareKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE).status, 'incompatible')
  assert.equal(reconcileKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE).status, 'incompatible')
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'dshmarket'])
  assert.equal(manifest.dependencies[CLAUDE_CODE_PACKAGE], '0.2.1-alpha.2')
  assert.ok(existsSync(join(root, 'node_modules', CLAUDE_CODE_PACKAGE, 'package.json')))
  assert.equal(readFileSync(join(root, 'settings.yaml'), 'utf8'), 'account: preserved\n')
})

test('newer Intel macOS also reports a missing native engine rather than promising activation', t => {
  const root = profile(t)
  platform(t, 'darwin', 'x64', '24.6.0')
  assert.equal(inspectKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE).status, 'incompatible')
  assert.match(inspectKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE).reason, /未包含 Claude Code 原生引擎/)
})

test('Intel macOS 13+ with a real native package and other platforms keep existing behavior', t => {
  const root = profile(t, true)
  platform(t, 'darwin', 'x64', '22.6.0')
  assert.equal(inspectKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE).status, 'irrelevant')
  Object.defineProperty(process, 'platform', { value: 'win32' })
  assert.equal(inspectKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE).status, 'irrelevant')
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  Object.defineProperty(process, 'arch', { value: 'arm64' })
  assert.equal(inspectKnownPluginCompatibility(root, CLAUDE_CODE_PACKAGE).status, 'irrelevant')
})

test('Monterey uses the guarded bundled market while preserving a registry-installed market', t => {
  const root = profile(t, true)
  const market = join(root, 'node_modules/dshmarket/lib/index.js')
  write(market, 'original registry market\n')
  const product = join(root, 'product')
  platform(t, 'darwin')
  const patch = intelMontereyMarketPatch(product)
  assert.match(patch, /- id: dsh-market/)
  const entry = JSON.parse(patch.match(/^  name: (.+)$/m)[1])
  assert.equal(entry, pathToFileURL(join(product, 'vendor/dshmarket/lib/index.js')).href)
  assert.equal(readFileSync(market, 'utf8'), 'original registry market\n')
  assert.equal(readFileSync(join(root, 'settings.yaml'), 'utf8'), 'account: preserved\n')
  const init = readFileSync(new URL('./init-tender-profile.mjs', import.meta.url), 'utf8')
  assert.match(init, /name === DSH_EMAIL_PACKAGE \|\| name === CLAUDE_CODE_PACKAGE/)
  assert.match(init, /\$\{intelMontereyMarketPatch\(root\)\}/)
  Object.defineProperty(process, 'platform', { value: 'win32' })
  assert.equal(intelMontereyMarketPatch(product), '')
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  Object.defineProperty(process, 'arch', { value: 'arm64' })
  assert.equal(intelMontereyMarketPatch(product), '')
})
