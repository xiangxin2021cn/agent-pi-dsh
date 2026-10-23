import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desktopProductIdentity, editionUserDataPath, matchingProductRelease } from '../product-identity.mjs'

test('mainline retains its installed profile and tender uses a separate identity and history home', () => {
  const mainline = desktopProductIdentity({ agentPiProduct: { edition: 'mainline' } })
  const tender = desktopProductIdentity({ agentPiProduct: { edition: 'tender' } })
  for (const field of ['appId', 'executableName', 'userDataName', 'artifactStem', 'releaseTagPrefix']) assert.notEqual(mainline[field], tender[field], field)
  assert.equal(mainline.userDataName, 'agent-pi-dsh-desktop')
  assert.equal(tender.userDataName, 'agent-pi-dsh-tender-desktop')
  assert.equal(editionUserDataPath(tender, 'app-data', 'isolated-test-profile'), 'isolated-test-profile')
})
test('each updater accepts only its own stable release tags and chooses the newest version', () => {
  const releases = ['v3.8.5', 'tender-v3.8.5', 'v3.9.0', 'tender-v3.8.6', 'v3.10.0', 'v3.99.0-beta', 'tender-v9.0.0'].map(tag_name => ({ tag_name, prerelease: tag_name === 'tender-v9.0.0' }))
  assert.equal(matchingProductRelease(desktopProductIdentity({}), releases).tag_name, 'v3.10.0')
  assert.equal(matchingProductRelease(desktopProductIdentity({ agentPiProduct: { edition: 'tender' } }), releases).tag_name, 'tender-v3.8.6')
  assert.equal(matchingProductRelease(desktopProductIdentity({ agentPiProduct: { edition: 'tender' } }), [{ tag_name: 'v9.0.0' }]), undefined)
})
