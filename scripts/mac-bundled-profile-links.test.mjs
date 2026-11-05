import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { test } from 'node:test'
import { macBundledProfileLinks, sealMacDshLinks } from './mac-bundled-profile-links.mjs'

function fixture(t) {
  const scratch = mkdtempSync(join(tmpdir(), 'agent-pi-mac-link-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const runtime = join(scratch, 'runtime')
  const productRoot = join(runtime, 'product')
  const dshRoot = join(runtime, 'deepseek-harness')
  const home = join(scratch, 'home')
  const source = join(dshRoot, 'vendor/schemastery')
  const dest = join(productRoot, 'bundles/agent-pi-compaction/node_modules/@deepseek-ai/schemastery')
  for (const path of [productRoot, dshRoot, home, source]) mkdirSync(path, { recursive: true })
  return { scratch, runtime, productRoot, dshRoot, home, source, dest }
}

function directoryLink(t, target, path) {
  try { symlinkSync(target, path, 'dir') }
  catch (error) {
    if (process.platform !== 'win32' || !['EACCES', 'EPERM'].includes(error.code)) throw error
    t.skip('Windows does not grant this test process directory symlink creation')
    return false
  }
  return true
}

test('sealed Mac peer verification cannot create a missing bundled link', t => {
  const f = fixture(t)
  const profile = macBundledProfileLinks({ ...f, stage: false })
  assert.throws(() => profile.plan(f.source, f.dest), /Missing or invalid sealed/)
  assert.equal(existsSync(dirname(f.dest)), false)
})

test('stage uses a relative link and the relocated sealed copy verifies without replacing it', t => {
  const f = fixture(t)
  const stage = macBundledProfileLinks({ ...f, stage: true })
  const plan = stage.plan(f.source, f.dest)
  assert.equal(isAbsolute(plan.target), false)
  assert.equal(plan.target, relative(dirname(plan.destination), realpathSync(f.source)))
  mkdirSync(dirname(plan.destination), { recursive: true })
  if (!directoryLink(t, plan.target, plan.destination)) return
  const moved = join(f.scratch, 'moved')
  renameSync(f.runtime, moved)
  const profile = macBundledProfileLinks({ productRoot: join(moved, 'product'), dshRoot: join(moved, 'deepseek-harness'), home: f.home, stage: false })
  const dest = join(moved, relative(f.runtime, f.dest))
  const source = join(moved, relative(f.runtime, f.source))
  const before = lstatSync(dest)
  assert.equal(profile.plan(source, dest), null)
  assert.equal(readlinkSync(dest), plan.target)
  assert.equal(lstatSync(dest).mtimeMs, before.mtimeMs)
})

test('registry peer plans stay in DSH_HOME and stage refuses that writable scope', t => {
  const f = fixture(t)
  const registryPeer = join(f.home, 'profiles/tender/node_modules/anysearch/node_modules/@deepseek-ai/schemastery')
  const profile = macBundledProfileLinks({ ...f, stage: false })
  const plan = profile.plan(f.source, registryPeer)
  assert.equal(plan.destination, join(realpathSync(f.home), relative(f.home, registryPeer)))
  assert.equal(plan.target, relative(dirname(plan.destination), realpathSync(f.source)))
  assert.equal(existsSync(dirname(registryPeer)), false)
  const stage = macBundledProfileLinks({ ...f, stage: true })
  assert.throws(() => stage.plan(f.source, registryPeer), /destination escaped/)
})

test('links are resolved from the real plugin parent and cannot reach an external registry', t => {
  const f = fixture(t)
  const profile = macBundledProfileLinks({ ...f, stage: false })
  const registry = join(f.home, 'registry')
  const outside = join(f.scratch, 'other')
  for (const path of [registry, outside]) mkdirSync(path)
  const registryAlias = join(f.home, 'registry-alias')
  const outsideAlias = join(f.home, 'outside-alias')
  if (!directoryLink(t, relative(dirname(registryAlias), registry), registryAlias)
    || !directoryLink(t, relative(dirname(outsideAlias), outside), outsideAlias)) return
  const checked = profile.plan(f.source, join(registryAlias, 'node_modules/peer'))
  assert.equal(checked.destination, join(realpathSync(registry), 'node_modules/peer'))
  assert.throws(() => profile.plan(f.source, join(outsideAlias, 'node_modules/peer')), /destination escaped/)
  assert.throws(() => profile.plan(outside, checked.destination), /target escaped/)
  const bundleAlias = join(f.productRoot, 'registry-alias')
  if (!directoryLink(t, relative(dirname(bundleAlias), registry), bundleAlias)) return
  assert.throws(() => profile.plan(f.source, join(bundleAlias, 'node_modules/peer')), /destination escaped/)
})

test('pre-sign staging verifies pnpm links before removing only the startup repair trigger', t => {
  const f = fixture(t)
  const dest = join(f.dshRoot, 'node_modules/peer')
  const manifest = join(f.dshRoot, '.agent-pi-links.json')
  mkdirSync(dirname(dest))
  if (!directoryLink(t, '../vendor/schemastery', dest)) return
  writeFileSync(manifest, JSON.stringify({ version: 1, links: [{ from: 'node_modules/peer', to: '../vendor/schemastery' }] }))
  const before = readlinkSync(dest)
  sealMacDshLinks(f.dshRoot)
  assert.equal(existsSync(manifest), false)
  assert.equal(readlinkSync(dest), before)
  assert.equal(realpathSync(dest), realpathSync(f.source))
})

test('malformed, mismatched, dangling and indirectly escaping pnpm links keep the repair manifest', t => {
  const f = fixture(t)
  const dest = join(f.dshRoot, 'node_modules/peer')
  const alias = join(f.dshRoot, 'vendor/alias')
  const manifest = join(f.dshRoot, '.agent-pi-links.json')
  mkdirSync(dirname(dest))
  if (!directoryLink(t, '../vendor/alias', dest)) return
  const record = (from, to) => writeFileSync(manifest, JSON.stringify({ version: 1, links: [{ from, to }] }))
  record('../outside', '../vendor/alias')
  assert.throws(() => sealMacDshLinks(f.dshRoot), /Invalid macOS DSH runtime link path/)
  record('node_modules/peer', '../vendor/redirect/../alias')
  assert.throws(() => sealMacDshLinks(f.dshRoot), /Non-canonical/)
  record('node_modules/peer', '../vendor/schemastery')
  assert.throws(() => sealMacDshLinks(f.dshRoot), /target differs/)
  record('node_modules/peer', '../vendor/alias')
  assert.throws(() => sealMacDshLinks(f.dshRoot), /Dangling/)
  const outside = join(f.scratch, 'outside')
  mkdirSync(outside)
  if (!directoryLink(t, relative(dirname(alias), outside), alias)) return
  assert.throws(() => sealMacDshLinks(f.dshRoot), /escapes its root/)
  assert.equal(existsSync(manifest), true)
  assert.equal(realpathSync(alias), realpathSync(outside))
})
