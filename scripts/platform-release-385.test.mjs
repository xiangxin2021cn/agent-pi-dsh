import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/build-desktop-assets.yml', import.meta.url), 'utf8')
const components = JSON.parse(readFileSync(new URL('../release/3.8.5-core-components.json', import.meta.url), 'utf8'))

test('desktop platform jobs use the audited Node and select only Macs for recovery', t => {
  assert.ok(workflow.includes(`NODE_RUNTIME_VERSION: '${components.runtime.version}'`))
  for (const macosOnly of ['false', 'true']) {
    const { root, run } = runChecksumGate(t, 'Select platform jobs', '', {})
    const output = join(root, 'matrix-output')
    const result = run({ MACOS_ONLY: macosOnly, GITHUB_OUTPUT: output })
    assert.equal(result.status, 0, result.stderr)
    const matrix = JSON.parse(readFileSync(output, 'utf8').trim().replace(/^matrix=/, ''))
    assert.deepEqual(matrix.include.map(job => job.name), macosOnly === 'true'
      ? ['mac-arm64', 'mac-x64'] : ['linux-x64', 'mac-arm64', 'mac-x64'])
    assert.deepEqual(matrix.include.filter(job => job.platform === 'mac').map(job => [job.os, job.arch, job.minimum_macos, job.node_dist]), [
      ['macos-15', 'arm64', '15.0.0', 'darwin-arm64'],
      ['macos-15-intel', 'x64', '15.0.0', 'darwin-x64'],
    ])
  }
  assert.match(workflow, /matrix: \$\{\{ fromJSON\(needs\.platform-matrix\.outputs\.matrix\) \}\}/)
  assert.match(workflow, /electron-builder --mac dmg zip --\$\{\{ matrix\.arch \}\}/)
  assert.ok(workflow.includes('--config.mac.minimumSystemVersion=${{ matrix.minimum_macos }}'))
  assert.match(workflow, /electron-builder --linux AppImage deb --x64/)
  assert.ok(workflow.includes("--config.appImage.artifactName='Agent-Pi-DSH-${version}-linux-x86_64.${ext}'"))
  assert.ok(workflow.includes("--config.deb.artifactName='Agent-Pi-DSH-${version}-linux-amd64.${ext}'"))
  assert.match(workflow, /if: matrix\.platform == 'mac'/)
  assert.match(workflow, /app_dir=mac-arm64\s+binary_arch=arm64/)
  assert.match(workflow, /app_dir=mac\s+binary_arch=x86_64/)
  assert.ok(workflow.includes('--arch "$binary_arch"'))
  assert.ok(workflow.includes('--maximum-macos "${{ matrix.minimum_macos }}"'))
  assert.ok(workflow.includes('--report "385-${{ matrix.name }}-scan.json"'))
  assert.match(workflow, /python3 scripts\/verify-macos-intel\.py/)
  assert.doesNotMatch(workflow, /python3 payload\/product\/scripts\/verify-macos-intel\.py/)
  assert.match(workflow, /if: always\(\) && matrix\.platform == 'mac'/)
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/)
  assert.ok(workflow.includes('name: ${{ matrix.name }}-deployment-targets'))
  assert.match(workflow, /path: 385-\$\{\{ matrix\.name \}\}-scan\.json\s+if-no-files-found: ignore\s+retention-days: 7/)
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
  const run = (environment = {}) => spawnSync(process.execPath, [join(root, 'gate.mjs'), argument], {
    cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...environment },
  })
  return { root, run }
}

test('maintenance dispatch accepts only fixed application source and reviewed publication paths', t => {
  const source = 'd8b8e6d1a55ff3e383b340f09cca44d2e38478cf'
  const maintenance = 'a'.repeat(40)
  const { root, run } = runChecksumGate(t, 'Verify immutable release ref', '', {
    'maintenance-changes.paths': 'README.md\0scripts/verify-macos-intel.py\0',
  })
  const environment = {
    RELEASE_TAG: 'v3.8.5', RELEASE_COMMIT: source, CHECKOUT_COMMIT: maintenance,
    GITHUB_SHA: maintenance, GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main', MACOS_ONLY: 'true',
  }
  assert.equal(run(environment).status, 0)
  for (const change of [
    { RELEASE_COMMIT: 'b'.repeat(40) }, { CHECKOUT_COMMIT: source },
    { GITHUB_REF_NAME: 'other' }, { MACOS_ONLY: 'false' }, { RELEASE_TAG: 'v3.8.6' },
  ]) assert.notEqual(run({ ...environment, ...change }).status, 0)
  writeFileSync(join(root, 'maintenance-changes.paths'), 'apps/desktop/main.mjs\0')
  const changedApp = run(environment)
  assert.notEqual(changedApp.status, 0)
  assert.match(changedApp.stderr, /application source changed/)
  const tag = { ...environment, CHECKOUT_COMMIT: source, GITHUB_SHA: source, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v3.8.5' }
  assert.equal(run(tag).status, 0)
  assert.notEqual(run({ ...tag, GITHUB_REF_NAME: 'v3.8.4' }).status, 0)
  assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_COMMIT" HEAD/)
})

test('release inputs reject a self-consistent replacement of the fixed v3.8.5 payload', t => {
  const bytes = Buffer.from('different payload with a matching replacement checksum')
  const name = 'runtime-payload-3.8.5.tar.gz'
  const { run } = runChecksumGate(t, 'Download and verify release inputs', '', {
    [`release-inputs/${name}`]: bytes,
    [`release-inputs/${name}.sha256`]: `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`,
  })
  const fixed = workflow.match(/V385_PAYLOAD_SHA256: '([a-f0-9]{64})'/)?.[1]
  assert.equal(fixed, '96e823b93395a1c64a5d49aa1153869485f5b5c3069365f9a6256f61b26e2765')
  const result = run({ V385_PAYLOAD_SHA256: fixed })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /fixed release input/)
})

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
