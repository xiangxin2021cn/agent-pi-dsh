import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  createWindowsBuildReceipt,
  verifyWindowsBuildReceipt,
} from './windows-build-receipt.mjs'

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-windows-receipt-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep))
    rmSync(root, { recursive: true, force: true })
  })
  write(join(root, 'package.json'), '{"version":"3.6.0","license":"GPL-3.0-only"}\n')
  write(join(root, 'DSH_PIN'), 'a66e4702047846cdaa10c66c9d3df3951f5ea70d\n')
  write(join(root, '.gitignore'), 'release/\nbuild/\ncad-viewer/\nDSH-BUILD-RECEIPT.json\n')
  execFileSync('git', ['init'], { cwd: root })
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'receipt@example.invalid'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Receipt Test'], { cwd: root })
  execFileSync('git', ['add', 'package.json', 'DSH_PIN', '.gitignore'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root })
  execFileSync('git', ['tag', 'v3.6.0'], { cwd: root })

  const installerPath = join(root, 'release', 'Agent-Pi-DSH-3.6.0-x64.exe')
  const payloadPath = join(root, 'build', 'payload.7z')
  const cadRuntimeDir = join(root, 'cad-viewer')
  const cadSourcePath = join(root, 'release', 'Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz')
  const dshReceiptPath = join(root, 'DSH-BUILD-RECEIPT.json')
  const receiptPath = `${installerPath}.build.json`
  write(installerPath, 'installer')
  write(payloadPath, 'payload')
  write(join(cadRuntimeDir, 'CAD-CLEAN-BUILD.json'), '{"kind":"clean"}\n')
  write(cadSourcePath, 'source')
  write(dshReceiptPath, '{"kind":"dsh"}\n')
  return { root, installerPath, payloadPath, cadRuntimeDir, cadSourcePath, dshReceiptPath, receiptPath }
}

function hotfixFixture(t, { revision = 'hotfix.1', desktopRevision = revision, tag = 'v3.8.7-hotfix.1' } = {}) {
  const value = fixture(t)
  write(join(value.root, 'package.json'), JSON.stringify({ version: '3.8.7', license: 'GPL-3.0-only', agentPiProduct: { edition: 'mainline', buildRevision: revision } }) + '\n')
  write(join(value.root, 'apps/desktop/package.json'), JSON.stringify({ version: '3.8.7', agentPiProduct: { edition: 'mainline', buildRevision: desktopRevision } }) + '\n')
  execFileSync('git', ['add', 'package.json', 'apps/desktop/package.json'], { cwd: value.root })
  execFileSync('git', ['commit', '-m', 'hotfix fixture'], { cwd: value.root })
  execFileSync('git', ['tag', tag], { cwd: value.root })
  value.installerPath = join(value.root, 'release', 'Agent-Pi-DSH-3.8.7-hotfix.1-x64.exe')
  value.receiptPath = value.installerPath + '.build.json'
  write(value.installerPath, 'hotfix installer fixture')
  return value
}

test('binds a Windows installer to the exact tag, payload, clean CAD source and DSH receipt', (t) => {
  const value = fixture(t)
  const receipt = createWindowsBuildReceipt(value)
  assert.equal(receipt.releaseTag, 'v3.6.0')
  assert.equal(Object.hasOwn(receipt, 'buildRevision'), false)
  assert.equal(receipt.installer.name, 'Agent-Pi-DSH-3.6.0-x64.exe')
  assert.equal(receipt.cadSource.name, 'Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz')
  assert.deepEqual(verifyWindowsBuildReceipt(value), receipt)
})

test('hotfix receipts retain app version and bind the revision, exact tag and separate installer', t => {
  const value = hotfixFixture(t)
  const receipt = createWindowsBuildReceipt(value)
  assert.equal(receipt.appVersion, '3.8.7')
  assert.equal(receipt.edition, 'mainline')
  assert.equal(receipt.buildRevision, 'hotfix.1')
  assert.equal(receipt.releaseTag, 'v3.8.7-hotfix.1')
  assert.equal(receipt.installer.name, 'Agent-Pi-DSH-3.8.7-hotfix.1-x64.exe')
  assert.deepEqual(verifyWindowsBuildReceipt(value), receipt)
  for (const revision of [undefined, 'hotfix.2']) {
    const altered = { ...receipt }
    if (revision === undefined) delete altered.buildRevision
    else altered.buildRevision = revision
    writeFileSync(value.receiptPath, JSON.stringify(altered))
    assert.throws(() => verifyWindowsBuildReceipt(value), /buildRevision mismatch/)
  }
})

test('a hotfix checkout rejects the published base tag and another revision tag', t => {
  for (const tag of ['v3.8.7', 'v3.8.7-hotfix.2']) {
    const value = hotfixFixture(t, { tag })
    assert.throws(() => createWindowsBuildReceipt(value), /exact v3\.8\.7-hotfix\.1 tag/)
  }
})

test('a hotfix cannot overwrite the old installer name or use another revision name', t => {
  const value = hotfixFixture(t)
  for (const name of ['Agent-Pi-DSH-3.8.7-x64.exe', 'Agent-Pi-DSH-3.8.7-hotfix.2-x64.exe']) {
    value.installerPath = join(value.root, 'release', name)
    write(value.installerPath, 'different installer fixture')
    assert.throws(() => createWindowsBuildReceipt(value), /different product edition or version/)
  }
})

test('both manifests must agree on the hotfix revision', t => {
  for (const [revision, desktopRevision] of [['hotfix.1', 'hotfix.2'], ['hotfix.1', undefined], [undefined, 'hotfix.1']]) {
    const value = hotfixFixture(t, { revision, desktopRevision })
    if (revision === undefined || desktopRevision === undefined) {
      const path = join(value.root, revision === undefined ? 'package.json' : 'apps/desktop/package.json')
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      delete manifest.agentPiProduct.buildRevision
      writeFileSync(path, JSON.stringify(manifest) + '\n')
      execFileSync('git', ['add', '.'], { cwd: value.root })
      execFileSync('git', ['commit', '-m', 'missing revision fixture'], { cwd: value.root })
    }
    assert.throws(() => createWindowsBuildReceipt(value), /build revision mismatch/)
  }
})

test('build revisions accept only hotfix followed by a positive integer', t => {
  for (const revision of ['hotfix.0', 'hotfix.01', 'hotfix.-1', 'Hotfix.1', 'hotfix.1/escape', 'hotfix.1\n', '', null, 1]) {
    const value = hotfixFixture(t, { revision })
    assert.throws(() => createWindowsBuildReceipt(value), /invalid Windows build revision/)
  }
})

test('hotfix builds still require a completely clean checkout', t => {
  const value = hotfixFixture(t)
  createWindowsBuildReceipt(value)
  write(join(value.root, 'untracked.txt'), 'dirty checkout')
  assert.throws(() => verifyWindowsBuildReceipt(value), /clean checkout/)
})

test('a legacy 3.8.7 receipt without a build revision remains valid', t => {
  const value = hotfixFixture(t)
  for (const name of ['package.json', 'apps/desktop/package.json']) {
    const path = join(value.root, name)
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    delete manifest.agentPiProduct.buildRevision
    writeFileSync(path, JSON.stringify(manifest) + '\n')
  }
  execFileSync('git', ['add', 'package.json', 'apps/desktop/package.json'], { cwd: value.root })
  execFileSync('git', ['commit', '-m', 'legacy 3.8.7 fixture'], { cwd: value.root })
  execFileSync('git', ['tag', 'v3.8.7'], { cwd: value.root })
  value.installerPath = join(value.root, 'release', 'Agent-Pi-DSH-3.8.7-x64.exe')
  value.receiptPath = value.installerPath + '.build.json'
  write(value.installerPath, 'legacy 3.8.7 installer')
  const receipt = createWindowsBuildReceipt(value)
  assert.equal(receipt.releaseTag, 'v3.8.7')
  assert.equal(Object.hasOwn(receipt, 'buildRevision'), false)
  assert.deepEqual(verifyWindowsBuildReceipt(value), receipt)
})

test('a later positive hotfix revision uses its own exact tag and filename', t => {
  const value = hotfixFixture(t, { revision: 'hotfix.42', tag: 'v3.8.7-hotfix.42' })
  value.installerPath = join(value.root, 'release', 'Agent-Pi-DSH-3.8.7-hotfix.42-x64.exe')
  value.receiptPath = value.installerPath + '.build.json'
  write(value.installerPath, 'later hotfix fixture')
  assert.equal(createWindowsBuildReceipt(value).buildRevision, 'hotfix.42')
  verifyWindowsBuildReceipt(value)
})

test('the actual Windows packaging metadata prefix generates the matching filename and rejects bad revisions', { skip: process.platform !== 'win32' }, t => {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url))
  const source = readFileSync(join(scriptDirectory, 'pack-win.ps1'), 'utf8')
  const marker = '$InstallerName = "$ArtifactStem-$ArtifactVersion-x64.exe"'
  const end = source.indexOf(marker)
  assert.notEqual(end, -1)
  for (const [revision, desktopRevision, expected] of [['hotfix.1', 'hotfix.1', 'Agent-Pi-DSH-3.8.7-hotfix.1-x64.exe'], ['hotfix.0', 'hotfix.0', null], ['hotfix.1\n', 'hotfix.1\n', null], ['hotfix.1', 'hotfix.2', null], [null, null, null], [undefined, undefined, 'Agent-Pi-DSH-3.8.7-x64.exe']]) {
    const value = hotfixFixture(t, { revision, desktopRevision })
    if (revision === undefined) for (const name of ['package.json', 'apps/desktop/package.json']) {
      const path = join(value.root, name)
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      delete manifest.agentPiProduct.buildRevision
      writeFileSync(path, JSON.stringify(manifest))
    }
    const helper = join(value.root, 'scripts/metadata-prefix.ps1')
    write(helper, source.slice(0, end + marker.length) + '\nWrite-Output $InstallerName\n')
    const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
    if (expected) {
      assert.equal(result.status, 0, result.stderr || result.error?.message)
      assert.equal(result.stdout.trim(), expected)
    } else assert.notEqual(result.status, 0)
  }
})

const nsisCompiler = process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'NSIS/makensis.exe')
test('NSIS preprocessing retains the default filename and accepts the controlled hotfix filename', { skip: !nsisCompiler || !existsSync(nsisCompiler) }, () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'nsis/setup.nsi')
  for (const name of [undefined, 'Agent-Pi-DSH-3.8.7-hotfix.1-x64.exe']) {
    const args = ['/PPO', '/DAPP_VERSION=3.8.7', '/DPRODUCT_ARTIFACT=Agent-Pi-DSH']
    if (name) args.push('/DINSTALLER_NAME=' + name)
    args.push(script)
    const result = spawnSync(nsisCompiler, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    assert.ok(result.stdout.includes('OutFile "' + (name || 'Agent-Pi-DSH-3.8.7-x64.exe') + '"'))
  }
})

test('rejects a stale installer, payload, CAD manifest, source archive or DSH receipt', (t) => {
  for (const field of ['installerPath', 'payloadPath', 'cadSourcePath', 'dshReceiptPath']) {
    const value = fixture(t)
    createWindowsBuildReceipt(value)
    writeFileSync(value[field], `${readFileSync(value[field], 'utf8')}tampered`)
    assert.throws(() => verifyWindowsBuildReceipt(value), /hash mismatch|size mismatch/)
  }

  const value = fixture(t)
  createWindowsBuildReceipt(value)
  writeFileSync(join(value.cadRuntimeDir, 'CAD-CLEAN-BUILD.json'), '{"kind":"dirty"}\n')
  assert.throws(() => verifyWindowsBuildReceipt(value), /hash mismatch|size mismatch/)
})

test('refuses to create a receipt away from the exact version tag or from a dirty checkout', (t) => {
  const value = fixture(t)
  execFileSync('git', ['tag', '-d', 'v3.6.0'], { cwd: value.root })
  assert.throws(() => createWindowsBuildReceipt(value), /exact v3\.6\.0 tag/)
  execFileSync('git', ['tag', 'v3.6.0'], { cwd: value.root })
  writeFileSync(join(value.root, 'package.json'), '{"version":"3.6.0","license":"GPL-3.0-only","dirty":true}\n')
  assert.throws(() => createWindowsBuildReceipt(value), /clean checkout/)
})

test('tender receipts require their own exact tag and installer, and reject mainline payload naming', t => {
  const value = fixture(t)
  const packagePath = join(value.root, 'package.json')
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
  manifest.agentPiProduct = { edition: 'tender', artifactStem: 'Agent-Pi-DSH-Tender', releaseTagPrefix: 'tender-v' }
  writeFileSync(packagePath, JSON.stringify(manifest) + '\n')
  execFileSync('git', ['add', 'package.json'], { cwd: value.root })
  execFileSync('git', ['commit', '-m', 'independent tender fixture'], { cwd: value.root })
  execFileSync('git', ['tag', 'v3.6.0-tender-invalid'], { cwd: value.root })
  assert.throws(() => createWindowsBuildReceipt(value), /exact tender-v3\.6\.0 tag/)
  execFileSync('git', ['tag', '-d', 'v3.6.0-tender-invalid'], { cwd: value.root })
  execFileSync('git', ['tag', 'tender-v3.6.0'], { cwd: value.root })
  assert.throws(() => createWindowsBuildReceipt(value), /different product edition/)
  value.installerPath = join(value.root, 'release', 'Agent-Pi-DSH-Tender-3.6.0-x64.exe')
  value.receiptPath = value.installerPath + '.build.json'
  writeFileSync(value.installerPath, 'tender installer fixture')
  const receipt = createWindowsBuildReceipt(value)
  assert.equal(receipt.edition, 'tender')
  assert.equal(receipt.releaseTag, 'tender-v3.6.0')
  assert.equal(receipt.installer.name, 'Agent-Pi-DSH-Tender-3.6.0-x64.exe')
  assert.deepEqual(verifyWindowsBuildReceipt(value), receipt)
})
