import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { desktopProductIdentity } from '../apps/desktop/product-identity.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'))
const manifest = read('package.json'), desktop = read('apps/desktop/package.json')
const product = desktopProductIdentity(desktop)

test('this product has one version, edition, installer and update identity', () => {
  assert.equal(manifest.version, '3.8.5')
  for (const file of ['apps/desktop/package.json', 'bundles/tender-host/package.json', 'bundles/agent-pi-compaction/package.json']) assert.equal(read(file).version, manifest.version, file)
  assert.equal(manifest.agentPiProduct.edition, product.edition)
  assert.equal(manifest.agentPiProduct.artifactStem, product.artifactStem)
  assert.equal(manifest.agentPiProduct.releaseTagPrefix, product.releaseTagPrefix)
  assert.equal(desktop.build.win.artifactName, product.artifactStem + '-${version}-x64.${ext}')
  assert.equal(desktop.build.appId, product.appId)
  assert.ok(desktop.build.files.includes('product-identity.mjs'))
  assert.ok(desktop.build.files.includes('edition-data-import.mjs'))
})
test('each edition has its expected UI boundary and retains professional workbench capabilities', () => {
  const dedicated = 'bundles/tender-web/src/client/tender-edition.js'
  assert.equal(existsSync(resolve(root, dedicated)), product.edition === 'tender')
  const client = readFileSync(resolve(root, 'bundles/tender-web/src/client/index.js'), 'utf8')
  assert.equal(client.includes('createTenderEdition'), product.edition === 'tender')
  for (const file of ['bundles/workbench/src/index.ts', 'bundles/knowledge/src/index.ts', 'bundles/china-tender/src/workflow.ts', 'bundles/tender-host/src/univer-office-open.ts', 'skills/tender-document-parsing/SKILL.md']) assert.ok(existsSync(resolve(root, file)), file)
})
