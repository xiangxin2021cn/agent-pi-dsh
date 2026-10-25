import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { stageNodeRuntime } from './prepare-runtime.mjs'
import { resolveNpmInvocation } from './install-univer-runtime-deps.mjs'

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-portable-node-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  function write(file, content) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  write('archive/lib/node_modules/npm/package.json', JSON.stringify({ name: 'npm', version: '11.19.1' }))
  write('pnpm/package.json', JSON.stringify({ name: 'pnpm', version: '11.28.5' }))
  for (const cli of ['npm-cli.js', 'npx-cli.js']) write(`archive/lib/node_modules/npm/bin/${cli}`, "console.log('11.19.1')\n")
  for (const cli of ['pnpm.cjs', 'pnpx.cjs']) write(`pnpm/bin/${cli}`, "console.log('11.28.5')\n")
  write('archive/lib/node_modules/npm/node_modules/locked-dependency/index.js', 'export default 1\n')
  mkdirSync(join(root, 'archive/bin'), { recursive: true })
  copyFileSync(process.execPath, join(root, 'archive/bin', nodeName))
  chmodSync(join(root, 'archive/bin', nodeName), 0o755)
  return { root, archive: join(root, 'archive'), pnpm: join(root, 'pnpm'), out: join(root, 'runtime/node'), write }
}

test('portable runtime includes pinned npm and pnpm closures beside the packaged Node', t => {
  const f = fixture(t)
  const node = stageNodeRuntime(f.archive, f.pnpm, f.out, 'pnpm@11.28.5')
  assert.equal(node, join(f.out, nodeName))
  assert.ok(existsSync(join(f.out, 'node_modules/npm/node_modules/locked-dependency/index.js')))
  assert.deepEqual(resolveNpmInvocation(node), { command: node, prefix: [join(f.out, 'node_modules/npm/bin/npm-cli.js')] })
  for (const [name, cli] of [['npm', 'npm/bin/npm-cli.js'], ['npx', 'npm/bin/npx-cli.js'], ['pnpm', 'pnpm/bin/pnpm.cjs'], ['pnpx', 'pnpm/bin/pnpx.cjs']]) {
    const shim = join(f.out, name)
    assert.ok(readFileSync(shim, 'utf8').includes(`exec "$basedir/${nodeName}" "$basedir/node_modules/${cli}" "$@"`))
    if (process.platform !== 'win32') {
      assert.ok(statSync(shim).mode & 0o111)
      const result = spawnSync(shim, ['--version'], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout.trim(), name.startsWith('np') ? '11.19.1' : '11.28.5')
    }
  }
})

test('a mismatched pnpm input is rejected before replacing the staged runtime', t => {
  const f = fixture(t)
  f.write('runtime/node/sentinel', 'keep')
  assert.throws(() => stageNodeRuntime(f.archive, f.pnpm, f.out, 'pnpm@11.28.4'), /packageManager pin/)
  assert.equal(readFileSync(join(f.out, 'sentinel'), 'utf8'), 'keep')
})

test('a bare Node archive or wrong npm version cannot omit Office repair dependencies', t => {
  const f = fixture(t)
  f.write('archive/lib/node_modules/npm/package.json', JSON.stringify({ name: 'npm', version: '11.19.0' }))
  assert.throws(() => stageNodeRuntime(f.archive, f.pnpm, f.out, 'pnpm@11.28.5'), /npm@11\.19\.1/)
  f.write('archive/lib/node_modules/npm/package.json', JSON.stringify({ name: 'npm', version: '11.19.1' }))
  rmSync(join(f.archive, 'lib/node_modules/npm/bin/npm-cli.js'))
  assert.throws(() => stageNodeRuntime(f.archive, f.pnpm, f.out, 'pnpm@11.28.5'), /input missing/)
})

test('staged manager version checks reject a CLI that disagrees with its manifest', t => {
  const f = fixture(t)
  f.write('pnpm/bin/pnpm.cjs', "console.log('11.28.4')\n")
  assert.throws(() => stageNodeRuntime(f.archive, f.pnpm, f.out, 'pnpm@11.28.5'), /Bundled pnpm does not start at its pinned version/)
})
