import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import test from 'node:test'

const { assertRuntime } = createRequire(import.meta.url)('../after-pack.cjs')

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
