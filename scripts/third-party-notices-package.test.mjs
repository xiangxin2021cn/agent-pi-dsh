import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = join(import.meta.dirname, '..')

test('repository carries the declared business-core and super-injector licenses', () => {
  const notices = readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')
  const businessManifest = JSON.parse(readFileSync(join(root, 'packages/business-core/package.json'), 'utf8'))
  const businessLicense = readFileSync(join(root, 'packages/business-core/LICENSE'), 'utf8')
  const injectorManifest = JSON.parse(readFileSync(join(root, 'vendor/dsh-super-injector/package.json'), 'utf8'))
  const injectorLicense = readFileSync(join(root, 'vendor/dsh-super-injector/LICENSE'), 'utf8')

  assert.equal(businessManifest.license, 'Apache-2.0')
  assert.match(businessLicense, /Apache License\s+Version 2\.0, January 2004/)
  assert.match(notices, /`@agent-pi\/business-core` 2\.2\.4/)
  assert.match(notices, /`packages\/business-core\/LICENSE`/)
  assert.match(notices, /does not claim or synthesize one/)

  assert.equal(injectorManifest.license, 'BSD-3-Clause')
  assert.match(injectorLicense, /BSD 3-Clause License/)
  assert.match(injectorLicense, /Copyright \(c\) 2026, yjh051108/)
  assert.match(notices, /`@dsh-external\/dsh-super-injector` 0\.3\.1/)
  assert.match(notices, /8b4099535976d1af85137ef9e93815cf14c3f094/)
  assert.match(notices, /sha256:1dfa8623b09684343843150600c4a9c58f2da1d9d0edfff7134a24091c99db4e/)
  assert.match(notices, /`vendor\/dsh-super-injector\/LICENSE`/)
  assert.match(notices, /No upstream `NOTICE` is claimed or\s+synthesized/)

  assert.match(notices, /does \*\*not\*\* distribute `dsh-univer-office` or its Univer\s+Pro runtime/)
  assert.match(notices, /obtain and comply with the applicable Univer commercial\s+license/)
  assert.match(notices, /DSH 0\.1\.2-rc\.1.*pending verification/s)
})

test('license notices ship in Windows and cross-platform runtime manifests', () => {
  for (const relativePath of [
    'scripts/prepare-win-runtime.ps1',
    'scripts/pack-win.ps1',
    'scripts/pack-runtime-payload.mjs',
  ]) {
    const source = readFileSync(join(root, relativePath), 'utf8')
    assert.match(source, /THIRD_PARTY_NOTICES\.md/, relativePath)
  }

  const windowsRuntime = readFileSync(join(root, 'scripts/prepare-win-runtime.ps1'), 'utf8')
  assert.match(windowsRuntime, /"packages"/)
  assert.match(windowsRuntime, /"vendor\\dsh-super-injector"/)

  const portableRuntime = readFileSync(join(root, 'scripts/pack-runtime-payload.mjs'), 'utf8')
  assert.match(portableRuntime, /'packages'/)
  assert.match(portableRuntime, /'vendor\/dsh-super-injector'/)

  const expectedPackagedLicenses = [
    'packages/business-core/LICENSE',
    'vendor/dsh-super-injector/LICENSE',
  ]
  for (const path of expectedPackagedLicenses) {
    assert.match(readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'), new RegExp(path.replaceAll('/', '\\/')))
  }
})

test('MLightCAD PoC records MIT and GPL packages and packaging requires license copies', () => {
  const notices = readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')
  assert.match(notices, /@mlightcad\/cad-simple-viewer` 1\.6\.3 — MIT/)
  assert.match(notices, /@mlightcad\/data-model` 1\.14\.3 — MIT/)
  assert.match(notices, /@mlightcad\/libredwg-converter` 3\.14\.3 — its package manifest declares GPL-3\.0/)
  assert.match(notices, /@mlightcad\/libredwg-web` 0\.7\.10 — its package manifest declares GPL-3\.0/)
  assert.match(notices, /conservative GPL-3\.0-only distribution\s+route/)
  assert.match(notices, /corresponding-source archive and checksum/)
  assert.match(notices, /Source Han Sans CN 2\.005 — SIL Open Font License 1\.1/)
  assert.match(notices, /SourceHanSansCN-OFL-1\.1\.txt/)

  for (const relativePath of ['scripts/pack-win.ps1', 'scripts/pack-runtime-payload.mjs']) {
    const source = readFileSync(join(root, relativePath), 'utf8')
    for (const license of [
      'LICENSE-BOUNDARY.md',
      'THIRD_PARTY_NOTICES.md',
      'mlightcad-cad-simple-viewer-LICENSE',
      'mlightcad-libredwg-converter-LICENSE',
      'GPL-3.0.txt',
      'SourceHanSansCN-OFL-1.1.txt',
    ]) {
      assert.match(source, new RegExp(license.replaceAll('.', '\\.')), relativePath)
    }
  }
})
