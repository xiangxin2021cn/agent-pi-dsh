import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import test from 'node:test'

const { assertRuntime, syncRuntime } = createRequire(import.meta.url)('../after-pack.cjs')

function fixture(t, external = false) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-after-pack-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep))
    rmSync(root, { recursive: true, force: true })
  })
  const runtime = join(root, 'runtime')
  function write(path, content = '') {
    const file = join(runtime, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  for (const path of ['deepseek-harness/package.json', 'deepseek-harness/apps/web/dist/index.html', 'deepseek-harness/apps/cli/lib/bin.js', 'product/scripts/init-tender-profile.mjs']) write(path)
  mkdirSync(join(runtime, 'deepseek-harness/node_modules/.pnpm'), { recursive: true })
  const node = join(runtime, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
  mkdirSync(dirname(node), { recursive: true })
  try { linkSync(process.execPath, node) } catch {
    copyFileSync(process.execPath, node)
    chmodSync(node, 0o755)
  }
  const target = external ? join(root, 'runtime-external') : join(runtime, 'deepseek-harness/packages/boot/app-boot')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'package.json'), '{"name":"@deepseek-ai/dsh-app-boot"}')
  const consumer = join(runtime, 'deepseek-harness/apps/cli/node_modules/@deepseek-ai/dsh-app-boot')
  mkdirSync(dirname(consumer), { recursive: true })
  symlinkSync(target, consumer, process.platform === 'win32' ? 'junction' : 'dir')
  return { runtime, write }
}

test('accepts a production CLI workspace link without the development tsx package', t => {
  const { runtime } = fixture(t)
  assert.equal(existsSync(join(runtime, 'deepseek-harness/node_modules/tsx')), false)
  assert.doesNotThrow(() => assertRuntime(runtime))
})

test('rejects a CLI link into a sibling with the same runtime path prefix', t => {
  const { runtime } = fixture(t, true)
  assert.throws(() => assertRuntime(runtime), /dependency escaped/)
})

test('requires the built CLI even when a development tsx package exists', t => {
  const { runtime, write } = fixture(t)
  write('deepseek-harness/node_modules/tsx/package.json', '{"name":"tsx"}')
  rmSync(join(runtime, 'deepseek-harness/apps/cli/lib/bin.js'))
  assert.throws(() => assertRuntime(runtime), /runtime incomplete/)
})

function syncFixture(t) {
  const temp = realpathSync(tmpdir())
  const root = mkdtempSync(join(temp, 'agent-pi-runtime-sync-'))
  t.after(() => { assert.ok(resolve(root).startsWith(temp + sep)); rmSync(root, { recursive: true, force: true }) })
  const source = join(root, 'source'), output = join(root, 'candidate'), target = join(output, 'resources/runtime')
  for (const path of [source, target]) mkdirSync(path, { recursive: true })
  writeFileSync(join(source, 'source-sentinel'), 'source retained')
  writeFileSync(join(target, 'old-sentinel'), 'old candidate')
  const link = (to, from) => symlinkSync(to, from, process.platform === 'win32' ? 'junction' : 'dir')
  return { root, source, output, target, link }
}

test('runtime sync replaces the managed candidate and removes retired SDKs instead of merging them', t => {
  const f = syncFixture(t)
  const retired = join(f.target, 'product/bundles/tender-host/node_modules/@openai/codex-win32-x64')
  mkdirSync(retired, { recursive: true }); writeFileSync(join(retired, 'package.json'), '{"name":"@openai/codex-win32-x64"}')
  syncRuntime(f.source, f.target, f.output)
  assert.equal(existsSync(retired), false)
  assert.equal(existsSync(join(f.target, 'old-sentinel')), false)
  assert.equal(readFileSync(join(f.target, 'source-sentinel'), 'utf8'), 'source retained')
  assert.equal(readFileSync(join(f.source, 'source-sentinel'), 'utf8'), 'source retained')
})

test('nested junctions in a stale candidate are unlinked without deleting their external or source targets', t => {
  const f = syncFixture(t), external = join(f.root, 'outside-candidate')
  mkdirSync(external); writeFileSync(join(external, 'sentinel'), 'external retained')
  f.link(external, join(f.target, 'external-link'))
  f.link(f.source, join(f.target, 'source-link'))
  f.link(f.target, join(f.target, 'cycle'))
  syncRuntime(f.source, f.target, f.output)
  assert.equal(readFileSync(join(external, 'sentinel'), 'utf8'), 'external retained')
  assert.equal(readFileSync(join(f.source, 'source-sentinel'), 'utf8'), 'source retained')
  assert.equal(existsSync(join(f.target, 'external-link')), false)
})

test('runtime sync rejects root/ancestor junctions and source aliases before removing any candidate files', async t => {
  for (const alias of ['source', 'output', 'resources', 'runtime']) await t.test(alias, t => {
    const f = syncFixture(t), external = join(f.root, 'outside-candidate')
    mkdirSync(external); writeFileSync(join(external, 'sentinel'), 'external retained')
    let source = f.source, output = f.output
    if (alias === 'source') { source = join(f.root, 'source-alias'); f.link(f.source, source) }
    if (alias === 'output') { output = join(f.root, 'output-alias'); f.link(f.output, output) }
    if (alias === 'resources') { rmSync(join(f.output, 'resources'), { recursive: true }); f.link(external, join(f.output, 'resources')) }
    if (alias === 'runtime') { rmSync(f.target, { recursive: true }); f.link(external, f.target) }
    assert.throws(() => syncRuntime(source, alias === 'output' ? join(output, 'resources/runtime') : f.target, output), /link|alias|real directory/)
    assert.equal(readFileSync(join(external, 'sentinel'), 'utf8'), 'external retained')
    assert.equal(readFileSync(join(f.source, 'source-sentinel'), 'utf8'), 'source retained')
  })
})

test('runtime sync rejects overlapping trees and an unbound destination before deletion', t => {
  const f = syncFixture(t)
  assert.throws(() => syncRuntime(f.source, f.target), /managed appOutDir/)
  assert.throws(() => syncRuntime(f.target, f.target, f.output), /overlap/)
  const nestedSource = join(f.target, 'nested-source'); mkdirSync(nestedSource)
  assert.throws(() => syncRuntime(nestedSource, f.target, f.output), /overlap/)
  const nestedOutput = join(f.source, 'candidate'); mkdirSync(nestedOutput)
  assert.throws(() => syncRuntime(f.source, join(nestedOutput, 'resources/runtime'), nestedOutput), /overlap/)
  const other = join(f.output, 'other'); mkdirSync(other); writeFileSync(join(other, 'sentinel'), 'retained')
  assert.throws(() => syncRuntime(f.source, other, f.output), /managed appOutDir resources/)
  assert.equal(readFileSync(join(other, 'sentinel'), 'utf8'), 'retained')
  assert.equal(readFileSync(join(f.target, 'old-sentinel'), 'utf8'), 'old candidate')
})
