import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  dshBuildCommands,
  dshBuildReceiptSchema,
  verifyDshBuildReceipt,
} from './dsh-build-receipt.mjs'
import { writeManifest } from './repair-dsh-links.mjs'
import { expectedDshCommit, expectedDshVersion } from './verify-dsh-runtime.mjs'

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function entry(root, path) {
  const file = join(root, path)
  return { path, bytes: readFileSync(file).length, sha256: sha256(file) }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-receipt-'))
  const dsh = join(root, 'dsh')
  const product = join(root, 'product')
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'apps/cli/package.json',
    'apps/cli/lib/bin.js',
    'apps/web/dist/index.html',
    'packages/core/example/lib/index.js',
    'packages/preset/agent-presets/presets/standard/agent.cordis.yml',
  ]) mkdirSync(dirname(join(dsh, file)), { recursive: true })
  mkdirSync(product, { recursive: true })
  writeFileSync(join(dsh, 'package.json'), `${JSON.stringify({ version: expectedDshVersion })}\n`)
  writeFileSync(join(dsh, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(dsh, 'pnpm-workspace.yaml'), 'packages: []\n')
  writeFileSync(join(dsh, 'apps/cli/package.json'), '{"name":"@deepseek-ai/dsh"}\n')
  writeFileSync(join(dsh, 'apps/cli/lib/bin.js'), 'cli\n')
  writeFileSync(join(dsh, 'apps/web/dist/index.html'), 'web\n')
  writeFileSync(join(dsh, 'packages/core/example/lib/index.js'), 'core\n')
  writeFileSync(join(dsh, 'packages/preset/agent-presets/presets/standard/agent.cordis.yml'), 'plugins: []\n')
  writeFileSync(join(product, 'DSH_PIN'), `${expectedDshCommit}\n`)
  const receiptPath = join(root, 'DSH-BUILD-RECEIPT.json')
  const receipt = {
    schemaVersion: dshBuildReceiptSchema,
    kind: 'agent-pi-dsh-official-build',
    dshCommit: expectedDshCommit,
    dshVersion: expectedDshVersion,
    dshPin: expectedDshCommit,
    buildCommands: dshBuildCommands,
    sourceFiles: [
      'apps/cli/package.json',
      'package.json',
      'packages/preset/agent-presets/presets/standard/agent.cordis.yml',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ].map((path) => entry(dsh, path)),
    artifacts: [
      'apps/cli/lib/bin.js',
      'apps/web/dist/index.html',
      'packages/core/example/lib/index.js',
    ].map((path) => entry(dsh, path)),
  }
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  return { root, dsh, product, dshRoot: dsh, productRoot: product, receiptPath }
}

test('verifies a staged DSH tree against its build receipt', () => {
  const value = fixture()
  try {
    const receipt = verifyDshBuildReceipt(value)
    assert.equal(receipt.dshCommit, expectedDshCommit)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('fails closed when a built artifact changes after receipt creation', () => {
  const value = fixture()
  try {
    writeFileSync(join(value.dsh, 'apps/web/dist/index.html'), 'tampered\n')
    assert.throws(() => verifyDshBuildReceipt(value), /hash mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('fails closed when an unreceipted build artifact is added', () => {
  const value = fixture()
  try {
    writeFileSync(join(value.dsh, 'apps/web/dist/extra.js'), 'extra\n')
    assert.throws(() => verifyDshBuildReceipt(value), /inventory length mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('fails closed when a nested package manifest changes after receipt creation', () => {
  const value = fixture()
  try {
    writeFileSync(join(value.dsh, 'apps/cli/package.json'), '{"name":"tampered","exports":"./evil.js"}\n')
    assert.throws(() => verifyDshBuildReceipt(value), /DSH source hash mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('fails closed when a runtime preset changes after receipt creation', () => {
  const value = fixture()
  try {
    writeFileSync(
      join(value.dsh, 'packages/preset/agent-presets/presets/standard/agent.cordis.yml'),
      'plugins:\n  - evil\n',
    )
    assert.throws(() => verifyDshBuildReceipt(value), /DSH source hash mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('fails closed when an unreceipted runtime source file is added', () => {
  const value = fixture()
  try {
    writeFileSync(join(value.dsh, 'apps/cli/evil.js'), 'export default true\n')
    assert.throws(() => verifyDshBuildReceipt(value), /DSH source inventory length mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('platform flock builds do not change the portable source receipt; unexpected native files fail closed', () => {
  const value = fixture()
  try {
    const directory = join(value.dsh, 'native/system/packages/linux-x64/bin/glibc')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'system.node'), 'platform build')
    assert.doesNotThrow(() => verifyDshBuildReceipt(value))
    writeFileSync(join(directory, 'unexpected.node'), 'unexpected')
    assert.throws(() => verifyDshBuildReceipt(value), /inventory length mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('installed verification permits old unused source and artifacts while strict verification still rejects them', () => {
  const value = fixture()
  try {
    const leftovers = ['packages/retired/source.ts', 'packages/retired/lib/index.js']
    for (const path of leftovers) {
      mkdirSync(dirname(join(value.dsh, path)), { recursive: true })
      writeFileSync(join(value.dsh, path), 'unused old-version file\n')
    }
    assert.equal(verifyDshBuildReceipt({ ...value, installed: true }).dshCommit, expectedDshCommit)
    assert.throws(() => verifyDshBuildReceipt(value), /inventory length mismatch/)
    for (const path of leftovers) assert.equal(readFileSync(join(value.dsh, path), 'utf8'), 'unused old-version file\n')

    const args = ['--dsh', value.dsh, '--product', value.product, '--receipt', value.receiptPath]
    const script = fileURLToPath(new URL('./dsh-build-receipt.mjs', import.meta.url))
    const options = { encoding: 'utf8', windowsHide: true, timeout: 10000 }
    const installed = spawnSync(process.execPath, [script, 'verify-installed', ...args], options)
    assert.ifError(installed.error)
    assert.equal(installed.status, 0, installed.stderr)
    assert.match(installed.stdout, /verify-installed receipt verified/)
    const strict = spawnSync(process.execPath, [script, 'verify', ...args], options)
    assert.notEqual(strict.status, 0)
    assert.match(strict.stderr, /inventory length mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

for (const [kind, path, replacement] of [
  ['source', 'packages/preset/agent-presets/presets/standard/agent.cordis.yml', 'plugins: {}\n'],
  ['artifact', 'packages/core/example/lib/index.js', 'evil\n'],
]) {
  test(`installed verification rejects missing declared ${kind} even when an old file replaces its inventory count`, () => {
    const value = fixture()
    try {
      rmSync(join(value.dsh, path))
      writeFileSync(join(value.dsh, path + '.retired'), 'unused old-version file\n')
      assert.throws(() => verifyDshBuildReceipt({ ...value, installed: true }), /inventory length mismatch|missing|hash mismatch/)
    } finally {
      rmSync(value.root, { recursive: true, force: true })
    }
  })

  test(`installed verification rejects same-size changes to a declared ${kind}`, () => {
    const value = fixture()
    try {
      const original = readFileSync(join(value.dsh, path))
      assert.equal(Buffer.byteLength(replacement), original.length)
      writeFileSync(join(value.dsh, path), replacement)
      assert.throws(() => verifyDshBuildReceipt({ ...value, installed: true }), /hash mismatch/)
    } finally {
      rmSync(value.root, { recursive: true, force: true })
    }
  })
}

test('installed verification still requires the exact receipt identity and build commands', () => {
  const value = fixture()
  try {
    const original = JSON.parse(readFileSync(value.receiptPath, 'utf8'))
    for (const [field, invalid] of [
      ['schemaVersion', -1], ['kind', 'untrusted'], ['dshCommit', 'wrong'],
      ['dshPin', 'wrong'], ['dshVersion', '0.0.0'], ['buildCommands', []],
    ]) {
      writeFileSync(value.receiptPath, JSON.stringify({ ...original, [field]: invalid }))
      assert.throws(() => verifyDshBuildReceipt({ ...value, installed: true }), /unsupported|mismatch/, field)
    }
    writeFileSync(value.receiptPath, JSON.stringify(original))
    writeFileSync(join(value.product, 'DSH_PIN'), 'wrong\n')
    assert.throws(() => verifyDshBuildReceipt({ ...value, installed: true }), /commit\/pin mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('installed verification cannot satisfy a receipt entry with a file outside its runtime root', () => {
  const value = fixture()
  try {
    const receipt = JSON.parse(readFileSync(value.receiptPath, 'utf8'))
    const outside = join(value.root, 'outside.txt')
    writeFileSync(outside, 'outside fixture marker\n')
    for (const path of ['../outside.txt', outside]) {
      receipt.sourceFiles[0] = { path, bytes: readFileSync(outside).length, sha256: sha256(outside) }
      writeFileSync(value.receiptPath, JSON.stringify(receipt))
      assert.throws(() => verifyDshBuildReceipt({ ...value, installed: true }), /inventory length mismatch|invalid|hash mismatch|missing/)
      assert.equal(readFileSync(outside, 'utf8'), 'outside fixture marker\n')
    }
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('installed verification rejects an empty source or artifact receipt inventory', () => {
  const value = fixture()
  try {
    const original = JSON.parse(readFileSync(value.receiptPath, 'utf8'))
    for (const field of ['sourceFiles', 'artifacts']) {
      writeFileSync(value.receiptPath, JSON.stringify({ ...original, [field]: [] }))
      assert.throws(() => verifyDshBuildReceipt({ ...value, installed: true }), /inventory|empty/)
    }
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('fails closed when a packaged directory is substituted with a symlink', () => {
  const value = fixture()
  try {
    const replacement = join(value.root, 'replacement-cli')
    mkdirSync(join(replacement, 'lib'), { recursive: true })
    writeFileSync(join(replacement, 'package.json'), '{"name":"@deepseek-ai/dsh"}\n')
    writeFileSync(join(replacement, 'lib/bin.js'), 'cli\n')
    rmSync(join(value.dsh, 'apps/cli'), { recursive: true, force: true })
    symlinkSync(replacement, join(value.dsh, 'apps/cli'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => verifyDshBuildReceipt(value), /must not be a symlink/)
    assert.throws(() => verifyDshBuildReceipt({ ...value, installed: true }), /must not be a symlink/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('ignores directories and generated metadata intentionally excluded from both staging paths', () => {
  const value = fixture()
  try {
    for (const relativePath of [
      'node_modules/example/index.js',
      'docs/guide.md',
      'website/index.html',
      '.dsh-build/client-build-environment.json',
      'packages/core/example/lib/index.js.map',
      'packages/core/example/lib/cache.tsbuildinfo',
    ]) {
      mkdirSync(dirname(join(value.dsh, relativePath)), { recursive: true })
      writeFileSync(join(value.dsh, relativePath), 'excluded\n')
    }
    assert.doesNotThrow(() => verifyDshBuildReceipt(value))
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('verifies a Windows FullCopy tree after staged link metadata is written', () => {
  const value = fixture()
  try {
    writeManifest(value.dsh, value.dsh)
    assert.equal(readFileSync(join(value.dsh, '.agent-pi-links.json'), 'utf8').includes('"links"'), true)
    assert.doesNotThrow(() => verifyDshBuildReceipt(value))
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('fails closed when DSH_PIN differs from the receipt', () => {
  const value = fixture()
  try {
    writeFileSync(join(value.product, 'DSH_PIN'), 'wrong\n')
    assert.throws(() => verifyDshBuildReceipt(value), /commit\/pin mismatch/)
  } finally {
    rmSync(value.root, { recursive: true, force: true })
  }
})

test('all packaging and staging entrypoints require the DSH build receipt', () => {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  for (const relativePath of [
    'scripts/pack-win.ps1',
    'scripts/pack-runtime-payload.mjs',
    'scripts/prepare-win-runtime.ps1',
    'scripts/prepare-runtime.mjs',
  ]) {
    const source = readFileSync(join(repositoryRoot, relativePath), 'utf8')
    assert.match(source, /dsh-build-receipt/)
  }
})

test('Windows and portable staging consume the shared receipt scope without dropping Windows dependencies', () => {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const portable = readFileSync(join(repositoryRoot, 'scripts/pack-runtime-payload.mjs'), 'utf8')
  const windows = readFileSync(join(repositoryRoot, 'scripts/prepare-win-runtime.ps1'), 'utf8')
  assert.match(portable, /dshRuntimeFilePolicy\.excludedDirectoryNames/)
  assert.match(portable, /dshRuntimeFilePolicy\.excludedFileNames/)
  assert.match(portable, /dshRuntimeFilePolicy\.excludedFileGlobs/)
  assert.match(portable, /const dshSrc = realpathSync\(join\(root, 'vendor', 'deepseek-harness'\)\)/)
  assert.match(windows, /dsh-runtime-file-policy\.json/)
  assert.match(windows, /WindowsDshCopyExcludedDirectoryNames/)
  assert.match(windows, /Where-Object \{ \$_ -ne "node_modules" \}/)
  assert.match(windows, /DshRuntimeFilePolicy\.excludedFileNames/)
  assert.match(windows, /DshRuntimeFilePolicy\.excludedFileGlobs/)
})
