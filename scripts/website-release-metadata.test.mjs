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
  assert.equal(identity.appVersion, current.version)
  assert.equal(identity.kernelVersion, current.dshVersion)
  assert.equal(identity.kernelPin, current.dshPin)
})
