import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'website', 'assets', 'js', 'release-metadata.js'), 'utf8')
const context = {}
runInNewContext(source, context)
const releaseIdentity = context.AgentPiReleaseMetadata.releaseIdentity

function release(body, tag = 'v3.6.0') {
  return { tag_name: tag, body }
}

function plain(value) {
  return value && JSON.parse(JSON.stringify(value))
}

test('reads the validated app and kernel identity from exactly one release marker', () => {
  const body = '<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.0","kernel":{"releaseTag":"dsh-v0.1.2-rc.1","commit":"A66E4702047846CDAA10C66C9D3DF3951F5EA70D"}} -->'
  assert.deepEqual(plain(releaseIdentity(release(body))), {
    appVersion: '3.6.0',
    kernelVersion: 'dsh-v0.1.2-rc.1',
    kernelPin: 'a66e4702047846cdaa10c66c9d3df3951f5ea70d',
  })
})

const snapshotMetadata = {
  schema: 1,
  appVersion: '3.8.5',
  kernel: {
    sourceKind: 'official-master-snapshot',
    packageVersion: '0.2.1-rc.3',
    commit: '22ddee3792402c3e70ec5f86a63c3e3e895a2f60',
  },
}

function structuredRelease(metadata) {
  return release(`<!-- agent-pi-release-meta: ${JSON.stringify(metadata)} -->`, `v${metadata.appVersion}`)
}

test('formats official master snapshots without inventing a release tag', () => {
  assert.deepEqual(plain(releaseIdentity(structuredRelease(snapshotMetadata))), {
    appVersion: '3.8.5',
    kernelVersion: '0.2.1-rc.3 (master snapshot)',
    kernelPin: '22ddee3792402c3e70ec5f86a63c3e3e895a2f60',
  })
  const laterSnapshot = {
    ...snapshotMetadata,
    appVersion: '3.8.6',
    kernel: { ...snapshotMetadata.kernel, packageVersion: '0.3.0-rc.1', commit: 'A'.repeat(40) },
  }
  assert.deepEqual(plain(releaseIdentity(structuredRelease(laterSnapshot))), {
    appVersion: '3.8.6',
    kernelVersion: '0.3.0-rc.1 (master snapshot)',
    kernelPin: 'a'.repeat(40),
  })
})

test('rejects incomplete, malformed and ambiguous snapshot identity fields', () => {
  for (const [field, value] of [
    ['sourceKind', undefined], ['sourceKind', null], ['sourceKind', 'other-snapshot'],
    ['packageVersion', undefined], ['packageVersion', ''], ['packageVersion', 'dsh-v0.2.1-rc.3'],
    ['packageVersion', ['0.2.1-rc.3']],
    ['commit', undefined], ['commit', '22ddee37'], ['commit', 'g'.repeat(40)],
    ['commit', [snapshotMetadata.kernel.commit]],
    ['releaseTag', 'dsh-v0.2.1-rc.3'], ['releaseTag', ''], ['releaseTag', null],
  ]) {
    const metadata = { ...snapshotMetadata, kernel: { ...snapshotMetadata.kernel, [field]: value } }
    assert.equal(releaseIdentity(structuredRelease(metadata)), null, `${field}: ${JSON.stringify(value)}`)
  }
})

test('supports the pre-marker 3.5.2 body only when it names one distinct kernel version', () => {
  assert.deepEqual(plain(releaseIdentity(release('DSH dsh-v0.1.2-alpha.3; again DSH-V0.1.2-ALPHA.3', 'v3.5.2'))), {
    appVersion: '3.5.2',
    kernelVersion: 'dsh-v0.1.2-alpha.3',
    kernelPin: null,
  })
  assert.equal(releaseIdentity(release('dsh-v0.1.2-alpha.2 then dsh-v0.1.2-alpha.3', 'v3.5.2')), null)
})

test('rejects missing, duplicate, malformed, or release-mismatched metadata', () => {
  const valid = '<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.0","kernel":{"releaseTag":"dsh-v0.1.2-rc.1","commit":"a66e4702047846cdaa10c66c9d3df3951f5ea70d"}} -->'
  assert.equal(releaseIdentity(release('no kernel identity')), null)
  assert.equal(releaseIdentity(release(valid + valid)), null)
  assert.equal(releaseIdentity(release('<!-- agent-pi-release-meta: {bad json} -->')), null)
  assert.equal(releaseIdentity(release(valid, 'v3.5.3')), null)
})

test('checked-in release metadata matches the current version and kernel history', () => {
  const appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  const history = JSON.parse(readFileSync(join(root, 'release', 'kernel-version-history.json'), 'utf8'))
  const current = history.find((entry) => entry.version === appVersion)
  const notes = readFileSync(join(root, 'release', `github-notes-${appVersion}.md`), 'utf8')
  const identity = releaseIdentity(release(notes, `v${appVersion}`))

  assert.ok(current)
  assert.ok(identity)
  assert.equal(identity.appVersion, current.version)
  const marker = notes.match(/<!--\s*agent-pi-release-meta:\s*({[\s\S]*?})\s*-->/)
  assert.ok(marker)
  const kernel = JSON.parse(marker[1]).kernel
  if (kernel.sourceKind === 'official-master-snapshot') {
    assert.equal(`dsh-v${kernel.packageVersion}`, current.dshVersion)
    assert.equal(identity.kernelVersion, `${kernel.packageVersion} (master snapshot)`)
  } else {
    assert.equal(identity.kernelVersion, current.dshVersion)
  }
  assert.equal(identity.kernelPin, current.dshPin)
})
