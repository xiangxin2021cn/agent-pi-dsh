import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  t.after(() => rmSync(root, { recursive: true, force: true }))
  write(join(root, 'package.json'), '{"version":"3.6.0","license":"GPL-3.0-only"}\n')
  write(join(root, 'DSH_PIN'), 'a66e4702047846cdaa10c66c9d3df3951f5ea70d\n')
  write(join(root, '.gitignore'), 'release/\nbuild/\ncad-viewer/\nDSH-BUILD-RECEIPT.json\n')
  execFileSync('git', ['init'], { cwd: root })
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

test('binds a Windows installer to the exact tag, payload, clean CAD source and DSH receipt', (t) => {
  const value = fixture(t)
  const receipt = createWindowsBuildReceipt(value)
  assert.equal(receipt.releaseTag, 'v3.6.0')
  assert.equal(receipt.installer.name, 'Agent-Pi-DSH-3.6.0-x64.exe')
  assert.equal(receipt.cadSource.name, 'Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz')
  assert.deepEqual(verifyWindowsBuildReceipt(value), receipt)
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
