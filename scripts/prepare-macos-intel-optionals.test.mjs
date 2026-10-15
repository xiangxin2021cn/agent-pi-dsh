import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { prepareMacOSIntelOptionals } from './prepare-macos-intel-optionals.mjs'

function write(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value) }
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-mac-optionals-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dsh = join(root, 'dsh'), product = join(root, 'product')
  write(join(dsh, 'package.json'), '{"name":"deepseek-harness"}')
  write(join(dsh, 'pnpm-lock.yaml'), 'unchanged lock')
  write(join(product, 'package.json'), '{"version":"3.8.2"}')
  return { root, dsh, product }
}
function codex(path, version) {
  write(join(path, 'package.json'), JSON.stringify({ name: '@openai/codex', version }))
  write(join(path, 'vendor/x86_64-apple-darwin/codex/codex'), 'keep native Codex')
  write(join(path, 'vendor/x86_64-apple-darwin/codex-resources/voice/bin/codex-voice-host'), 'newer-system voice')
  write(join(path, 'vendor/x86_64-apple-darwin/codex-resources/zsh/bin/zsh'), 'newer-system shell')
}

test('compatibility preparation excludes newer-system optionals and retains both actual Codex CLIs', t => {
  const { dsh, product } = fixture(t)
  for (const name of ['@anthropic-ai/claude-agent-sdk-darwin-x64', 'sherpa-onnx-darwin-x64', '@trycua/cua-driver-darwin-x64']) {
    write(join(dsh, 'node_modules', name, 'package.json'), JSON.stringify({ name }))
    write(join(dsh, 'node_modules', name, 'native.node'), 'optional native')
  }
  const upstream = join(dsh, 'node_modules/.pnpm/@openai+codex@0.153.4-darwin-x64/node_modules/@openai/codex')
  const host = join(product, 'bundles/tender-host/node_modules/@openai/codex-darwin-x64')
  codex(upstream, '0.153.4-darwin-x64'); codex(host, '0.162.0-darwin-x64')
  const result = prepareMacOSIntelOptionals(dsh, product)
  assert.equal(result.removed, 3)
  assert.equal(result.codexResources.length, 4)
  for (const path of [upstream, host]) {
    assert.equal(readFileSync(join(path, 'vendor/x86_64-apple-darwin/codex/codex'), 'utf8'), 'keep native Codex')
    assert.equal(existsSync(join(path, 'vendor/x86_64-apple-darwin/codex-resources/voice')), false)
    assert.equal(existsSync(join(path, 'vendor/x86_64-apple-darwin/codex-resources/zsh')), false)
    assert.ok(existsSync(join(path, 'package.json')))
  }
  assert.equal(readFileSync(join(dsh, 'pnpm-lock.yaml'), 'utf8'), 'unchanged lock')
  const marker = JSON.parse(readFileSync(join(product, 'MACOS-INTEL-MONTEREY.json'), 'utf8'))
  assert.deepEqual(marker.disabledCapabilities, ['claude-code', 'local-voice', 'native-cua', 'codex-voice', 'codex-zsh-fork'])
  assert.equal(prepareMacOSIntelOptionals(dsh, product).codexResources.length, 0)
})

test('resource cleanup rejects links outside the actual Codex package without deleting their target', t => {
  const { root, dsh, product } = fixture(t)
  const pkg = join(product, 'bundles/tender-host/node_modules/@openai/codex-darwin-x64')
  write(join(pkg, 'package.json'), '{"name":"@openai/codex","version":"0.162.0-darwin-x64"}')
  const outside = join(root, 'external-resources')
  write(join(outside, 'important'), 'preserved')
  const link = join(pkg, 'vendor/x86_64-apple-darwin/codex-resources/zsh')
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(process.platform === 'win32' ? outside : relative(dirname(link), outside), link,
    process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => prepareMacOSIntelOptionals(dsh, product), /escapes its package/)
  assert.equal(readFileSync(join(outside, 'important'), 'utf8'), 'preserved')
  assert.equal(existsSync(join(product, 'MACOS-INTEL-MONTEREY.json')), false)
})
