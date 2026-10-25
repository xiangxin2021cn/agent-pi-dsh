import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/build-desktop-assets.yml', import.meta.url), 'utf8')
const components = JSON.parse(readFileSync(new URL('../release/3.8.5-core-components.json', import.meta.url), 'utf8'))

test('desktop platform jobs use the audited Node and include Intel, Apple silicon and Linux', () => {
  assert.ok(workflow.includes(`NODE_RUNTIME_VERSION: '${components.runtime.version}'`))
  assert.match(workflow, /os: macos-15\s+name: mac-arm64\s+platform: mac\s+arch: arm64\s+node_dist: darwin-arm64/)
  assert.match(workflow, /os: macos-15-intel\s+name: mac-x64\s+platform: mac\s+arch: x64\s+node_dist: darwin-x64/)
  assert.match(workflow, /os: ubuntu-latest\s+name: linux-x64\s+platform: linux\s+arch: x64\s+node_dist: linux-x64/)
  assert.match(workflow, /electron-builder --mac dmg zip --\$\{\{ matrix\.arch \}\}/)
  assert.match(workflow, /--config\.mac\.minimumSystemVersion=13\.5\.0/)
  assert.match(workflow, /electron-builder --linux AppImage deb --x64/)
  assert.ok(workflow.includes("--config.appImage.artifactName='Agent-Pi-DSH-${version}-linux-x86_64.${ext}'"))
  assert.ok(workflow.includes("--config.deb.artifactName='Agent-Pi-DSH-${version}-linux-amd64.${ext}'"))
  assert.match(workflow, /if: matrix\.name == 'mac-x64'/)
  assert.match(workflow, /--maximum-macos 13\.5\s+\\\s+--report 385-mac-x64-scan\.json/)
})

test('platform jobs retain runtime, native terminal, Office, CAD and plan verification before uploading', () => {
  for (const marker of [
    'pnpm --recursive rebuild node-pty koffi',
    'native/system/scripts/build.ts --host-addon-only',
    'scripts/ensure-spawn-helper.mjs',
    'install-univer-runtime-deps.mjs payload/product/vendor/dsh-univer-office --verify-only',
    'univer-public-release.mjs assert-tree',
    'cad-clean-release.mjs verify',
    'verify-project-plan-runtime.mjs',
    '--node-dir node-runtime',
    '--pnpm-dir verified-pnpm/package',
    'payload/desktop/runtime/product --native',
  ]) assert.ok(workflow.includes(marker), marker)
  assert.ok(workflow.indexOf('Stage runtime') < workflow.indexOf('Upload release assets'))
  assert.doesNotMatch(workflow, /--clobber/)
})

function runChecksumGate(t, step, argument, files) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-platform-checksum-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = workflow.slice(workflow.indexOf(`- name: ${step}`)).match(/<<'NODE'\r?\n([\s\S]+?)\r?\n          NODE/)?.[1]
  assert.ok(source, `${step} must validate downloaded bytes before extraction`)
  writeFileSync(join(root, 'gate.mjs'), source.replace(/^          /gm, ''))
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
  }
  const run = () => spawnSync(process.execPath, [join(root, 'gate.mjs'), argument], { cwd: root, encoding: 'utf8', windowsHide: true })
  return { root, run }
}

test('Node archive verification accepts exact official bytes and rejects a changed archive', (t) => {
  const bytes = Buffer.from('isolated Node archive fixture')
  const name = 'node-v24.22.1-darwin-x64.tar.gz'
  const { root, run } = runChecksumGate(t, 'Download Node runtime binary', name, {
    'node-runtime.archive': bytes,
    'node-runtime.SHASUMS256.txt': `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`,
  })
  const valid = run()
  assert.equal(valid.status, 0, valid.stderr)
  writeFileSync(join(root, 'node-runtime.archive'), 'changed')
  assert.notEqual(run().status, 0)
})

test('pnpm archive verification uses the DSH lock and rejects changed or missing resolutions', (t) => {
  const bytes = Buffer.from('isolated pnpm archive fixture')
  const version = '11.28.5'
  const { root, run } = runChecksumGate(t, 'Prepare pinned pnpm for the installed app', version, {
    'payload/deepseek-harness/pnpm-lock.yaml': `packages:\n  pnpm@${version}:\n    resolution: {integrity: sha512-${createHash('sha512').update(bytes).digest('base64')}}\nsnapshots:\n  pnpm@${version}: {}\n`,
    'verified-pnpm/pack.json': JSON.stringify([{ filename: `pnpm-${version}.tgz` }]),
    [`verified-pnpm/pnpm-${version}.tgz`]: bytes,
  })
  const valid = run()
  assert.equal(valid.status, 0, valid.stderr)
  writeFileSync(join(root, `verified-pnpm/pnpm-${version}.tgz`), 'changed')
  assert.notEqual(run().status, 0)
  writeFileSync(join(root, `verified-pnpm/pnpm-${version}.tgz`), bytes)
  writeFileSync(join(root, 'payload/deepseek-harness/pnpm-lock.yaml'), 'packages: {}\n')
  assert.notEqual(run().status, 0)
})
