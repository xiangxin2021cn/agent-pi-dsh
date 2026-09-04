import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import {
  loadUniverPin,
  materializeDshUniverOffice,
  verifyMaterializedUniver,
} from './materialize-dsh-univer-office.mjs'

const legacyClient = [
  'var inject = ["slots", "locale", "conversationEvents"];',
  'ctx.conversationEvents.register(univerTurnDefinition);',
  'function turnFilesOfSession(session, cwd) {',
  '      if (session === void 0) return [];',
  '      for (const turn of session.chat.timeline.turns.values()) {',
  'const session = props.useSession((snapshot) => snapshot);',
  'const latestTurns = React4.useMemo(() => latestWorktreeTurns(session), [session]);',
  'function latestWorktreeTurns(session) {',
  '      const latest = /* @__PURE__ */ new Map();',
  '      for (const [turnNumber, turn] of session.chat.timeline.turns) {',
  'const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd);',
  '      const turnFiles = React6.useMemo(() => turnFilesOfSession(props.session, cwd), [props.session, cwd]);',
  '',
].join('\n')

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function runTar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}

function fixture(t, { license = 'Apache-2.0', hardLink = false, outsideEntry = false, symbolicLink = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'agent-pi-univer-materialize-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const root = join(directory, 'repository')
  const packageRoot = join(directory, 'source', 'package')
  write(join(packageRoot, 'package.json'), `${JSON.stringify({
    name: 'dsh-univer-office',
    version: '0.2.9',
    license,
  })}\n`)
  write(join(packageRoot, 'LICENSE'), 'Apache License\nVersion 2.0, January 2004\n')
  write(join(packageRoot, 'lib', 'index.js'), 'export {}\n')
  write(join(packageRoot, 'lib', 'client.js'), legacyClient)
  if (hardLink) linkSync(join(packageRoot, 'LICENSE'), join(packageRoot, 'LICENSE.link'))
  if (symbolicLink) symlinkSync('LICENSE', join(packageRoot, 'LICENSE.link'), 'file')
  if (outsideEntry) write(join(directory, 'source', 'outside.txt'), 'outside package root\n')

  const archivePath = join(directory, 'dsh-univer-office-0.2.9.tgz')
  const archiveItems = outsideEntry ? ['package', 'outside.txt'] : ['package']
  runTar(['-czf', archivePath, '-C', join(directory, 'source'), ...archiveItems])
  const bytes = readFileSync(archivePath)
  const archiveEntries = runTar(['-tzf', archivePath]).split(/\r?\n/).filter(Boolean).length
  const pin = {
    schema: 'agent-pi-dsh/univer-office-pin/v1',
    name: 'dsh-univer-office',
    version: '0.2.9',
    license: 'Apache-2.0',
    tarball: 'https://registry.npmjs.org/dsh-univer-office/-/dsh-univer-office-0.2.9.tgz',
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    shasum: createHash('sha1').update(bytes).digest('hex'),
    archiveBytes: bytes.length,
    archiveEntries,
    source: {
      repository: 'https://github.com/dream-num/dsh-univer-office',
      tag: 'v0.2.9',
      tagObject: 'a'.repeat(40),
      commit: 'b'.repeat(40),
    },
  }
  const pinPath = join(root, 'vendor', 'dsh-univer-office.pin')
  write(pinPath, `${JSON.stringify(pin, null, 2)}\n`)
  return { archivePath, directory, pin, pinPath, root }
}

test('tracked pin binds Univer 0.2.9 to the npm tarball and upstream source commit', () => {
  const pin = loadUniverPin(join(import.meta.dirname, '..', 'vendor', 'dsh-univer-office.pin'))
  assert.equal(pin.version, '0.2.9')
  assert.equal(pin.license, 'Apache-2.0')
  assert.equal(pin.source.tag, 'v0.2.9')
  assert.equal(pin.source.tagObject, '403d919dc2636ce036609ac7ea63a365a57fcdcb')
  assert.equal(pin.source.commit, 'e0222951012ff6eddd76e54c94975d9a27fd6032')
  assert.equal(pin.tarball, 'https://registry.npmjs.org/dsh-univer-office/-/dsh-univer-office-0.2.9.tgz')
  assert.equal(pin.integrity, 'sha512-0gvUi/JH70+r5Lx3Q9LyPhsaugUQaYgFjshWbMJcGV+eCTiZ/+YBL6r4J8V9wzwdBvCBjehxmTeTed7tsCiuag==')
  assert.equal(pin.shasum, 'f9137166038351c4c646912e882d47f01b53ba8d')
  assert.equal(pin.archiveBytes, 35_613_705)
  assert.equal(pin.archiveEntries, 241)
})

test('materializes, patches, receipts, and verifies a clean pinned package', async (t) => {
  const item = fixture(t)
  const result = await materializeDshUniverOffice(item)
  const plugin = join(item.root, 'vendor', 'dsh-univer-office')
  assert.equal(result.destination, plugin)
  assert.equal(verifyMaterializedUniver(plugin, item.pinPath).package.version, '0.2.9')
  const client = readFileSync(join(plugin, 'lib', 'client.js'), 'utf8')
  assert.match(client, /ctx\.uiConversation\.events\.register/)
  assert.doesNotMatch(client, /conversationEvents/)
  assert.equal(existsSync(join(plugin, 'AGENT-PI-VENDOR-RECEIPT.json')), true)
  const receipt = JSON.parse(readFileSync(join(plugin, 'AGENT-PI-VENDOR-RECEIPT.json'), 'utf8'))
  assert.deepEqual(receipt.files.map((file) => file.path), [
    'LICENSE',
    'lib/client.js',
    'lib/index.js',
    'package.json',
  ])
  assert.ok(receipt.files.every((file) => Number.isSafeInteger(file.size) && /^[a-f0-9]{64}$/.test(file.sha256)))
})

test('verification rejects changed, added, and removed materialized files', async (t) => {
  for (const mutation of ['changed', 'added', 'removed']) {
    await t.test(mutation, async (t) => {
      const item = fixture(t)
      await materializeDshUniverOffice(item)
      const plugin = join(item.root, 'vendor', 'dsh-univer-office')
      if (mutation === 'changed') write(join(plugin, 'lib', 'index.js'), 'export const tampered = true\n')
      if (mutation === 'added') write(join(plugin, 'unexpected.js'), 'unexpected\n')
      if (mutation === 'removed') rmSync(join(plugin, 'lib', 'index.js'))
      assert.throws(
        () => verifyMaterializedUniver(plugin, item.pinPath),
        /vendor receipt file tree mismatch|is missing lib\/index\.js/,
      )
    })
  }
})

test('rejects a tarball integrity mismatch before replacing an existing package', async (t) => {
  const item = fixture(t)
  item.pin.integrity = `sha512-${Buffer.alloc(64).toString('base64')}`
  write(item.pinPath, `${JSON.stringify(item.pin, null, 2)}\n`)
  const marker = join(item.root, 'vendor', 'dsh-univer-office', 'keep.txt')
  write(marker, 'existing\n')
  await assert.rejects(() => materializeDshUniverOffice(item), /SHA512 integrity mismatch/)
  assert.equal(readFileSync(marker, 'utf8'), 'existing\n')
})

test('rejects a hard-link archive entry before extraction', async (t) => {
  const item = fixture(t, { hardLink: true })
  await assert.rejects(() => materializeDshUniverOffice(item), /unsafe .* entry type: hard link/)
})

test('rejects a symbolic-link archive entry before extraction', async (t) => {
  let item
  try {
    item = fixture(t, { symbolicLink: true })
  } catch (error) {
    if (error?.code === 'EPERM') return t.skip('symbolic links require Windows developer privileges')
    throw error
  }
  await assert.rejects(() => materializeDshUniverOffice(item), /unsafe .* entry type: symbolic link/)
})

test('rejects archive entries outside the npm package root before extraction', async (t) => {
  const item = fixture(t, { outsideEntry: true })
  await assert.rejects(() => materializeDshUniverOffice(item), /archive entry is outside package/)
})

test('rejects package metadata that disagrees with the pin', async (t) => {
  const item = fixture(t, { license: 'MIT' })
  await assert.rejects(() => materializeDshUniverOffice(item), /package identity does not match/)
})
