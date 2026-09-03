import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
