import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  detachInstalledUniverProfile,
  verifyInstalledUniverProduct,
} from './installer-univer-lifecycle.mjs'
import { syncManagedUniverSkills } from './univer-skill-sync.mjs'

const nsisSource = readFileSync(new URL('./nsis/setup.nsi', import.meta.url), 'utf8')

function write(path, content = '') {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-installer-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return {
    root,
    product: join(root, 'install/resources/runtime/product'),
    profile: join(root, 'app-data/dsh-home/profiles/tender'),
  }
}

const nativeClient = [
  'function CombinedSnapshotPreviewCard(props) {',
  '  const timeline = props.useSession((snapshot) => snapshot.chat.timeline);',
  '}',
  'function SplitSnapshotPreviewCard(props) {',
  '  const timeline = props.useChat((snapshot) => snapshot.timeline);',
  '}',
  'function registerConversationDefinition(ctx, definition) {',
  '  const uiConversation = ctx.get("uiConversation");',
  '  if (uiConversation !== void 0) {',
  '    registerDefinition(uiConversation.events, definition);',
  '    return "split";',
  '  }',
  '  const conversationEvents = ctx.get("conversationEvents");',
  '  if (conversationEvents === void 0) {',
  '    throw new Error("dsh-univer-office: active conversation service exposes no event registry");',
  '  }',
  '  registerDefinition(conversationEvents, definition);',
  '  return "combined";',
  '}',
  'var inject = ["slots", "locale", "conversation"];',
  'const PreviewCard = conversationApi === "split" ? SplitSnapshotPreviewCard : CombinedSnapshotPreviewCard;',
].join('\n')

function writeVerifiedPlugin(product, { client = nativeClient, corrupt = false, version = '0.2.13' } = {}) {
  const plugin = join(product, 'vendor/dsh-univer-office')
  const files = [
    ['LICENSE', 'Apache License'],
    ['lib/index.js', 'export {}'],
    ['lib/client.js', client],
    ['skills/univer-sheet/SKILL.md', '# Univer sheet\n'],
    ['package.json', `${JSON.stringify({
      name: 'dsh-univer-office',
      version,
      dsh: { bundle: {} },
    })}\n`],
  ]
  for (const [name, content] of files) write(join(plugin, name), content)
  const inventory = files.map(([name]) => {
    const bytes = readFileSync(join(plugin, name))
    return { path: name, size: bytes.length, sha256: sha256(bytes) }
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  write(join(plugin, 'AGENT-PI-VENDOR-RECEIPT.json'), `${JSON.stringify({
    schema: 'agent-pi-dsh/univer-office-vendor-receipt/v1',
    package: { name: 'dsh-univer-office', version, license: 'Apache-2.0' },
    patchedClient: { path: 'lib/client.js', sha256: corrupt ? '0'.repeat(64) : sha256(Buffer.from(client)) },
    files: inventory,
  })}\n`)
  return plugin
}

test('post-extract verification accepts an absent optional integration or one clean receipted bundle', (t) => {
  const item = fixture(t)
  assert.deepEqual(verifyInstalledUniverProduct(item.product), { present: false })

  writeVerifiedPlugin(item.product)
  assert.deepEqual(verifyInstalledUniverProduct(item.product), {
    present: true,
    version: '0.2.13',
    files: 5,
  })
})

test('required verification rejects an absent bundle and executes the locked native runtime verifier', (t) => {
  const absent = fixture(t)
  assert.throws(
    () => verifyInstalledUniverProduct(absent.product, { required: true }),
    /required licensed dsh-univer-office is not bundled/,
  )

  const item = fixture(t)
  const plugin = writeVerifiedPlugin(item.product)
  let verified = null
  const result = verifyInstalledUniverProduct(item.product, {
    required: true,
    runtimeVerifier(pluginRoot, productRoot) {
      verified = { pluginRoot, productRoot }
    },
  })
  assert.deepEqual(verified, { pluginRoot: plugin, productRoot: item.product })
  assert.equal(result.runtimeVerified, true)

  const cli = spawnSync(process.execPath, [
    fileURLToPath(new URL('./installer-univer-lifecycle.mjs', import.meta.url)),
    'verify-product',
    absent.product,
    '--required',
  ], { encoding: 'utf8', windowsHide: true })
  assert.notEqual(cli.status, 0)
  assert.match(cli.stderr, /required licensed dsh-univer-office is not bundled/)
})

test('post-extract verification rejects an old DSH client or a mixed vendor receipt', (t) => {
  const legacy = fixture(t)
  writeVerifiedPlugin(legacy.product, {
    client: 'ctx.conversationEvents.register(univerTurnDefinition); props.useSession(() => {}); session.chat.timeline;',
  })
  assert.throws(
    () => verifyInstalledUniverProduct(legacy.product),
    /native client layout does not match/,
  )

  const mixed = fixture(t)
  writeVerifiedPlugin(mixed.product, { corrupt: true })
  assert.throws(
    () => verifyInstalledUniverProduct(mixed.product),
    /patched client receipt mismatch/,
  )
})

test('post-extract verification fails closed for a malformed 0.2.13 native adapter', (t) => {
  const item = fixture(t)
  writeVerifiedPlugin(item.product, {
    client: nativeClient.replace(
      'conversationApi === "split" ? SplitSnapshotPreviewCard : CombinedSnapshotPreviewCard',
      'CombinedSnapshotPreviewCard',
    ),
  })

  assert.throws(
    () => verifyInstalledUniverProduct(item.product),
    /native client layout does not match/,
  )
})

test('post-extract verification rejects missing, modified, or unreceipted nested vendor files', (t) => {
  const modified = fixture(t)
  const modifiedPlugin = writeVerifiedPlugin(modified.product)
  write(join(modifiedPlugin, 'skills/univer-sheet/SKILL.md'), 'tampered\n')
  assert.throws(
    () => verifyInstalledUniverProduct(modified.product),
    /receipted file mismatch|file tree mismatch/,
  )

  const missing = fixture(t)
  const missingPlugin = writeVerifiedPlugin(missing.product)
  rmSync(join(missingPlugin, 'skills/univer-sheet/SKILL.md'))
  assert.throws(
    () => verifyInstalledUniverProduct(missing.product),
    /missing receipted file/,
  )

  const extra = fixture(t)
  const extraPlugin = writeVerifiedPlugin(extra.product)
  write(join(extraPlugin, 'lib/obsolete-vendor-file.js'), 'stale\n')
  assert.throws(
    () => verifyInstalledUniverProduct(extra.product),
    /vendor receipt file tree mismatch/,
  )
})

test('uninstall detaches only the exact product-owned profile link and its bundle', (t) => {
  const item = fixture(t)
  const target = join(item.product, 'vendor/dsh-univer-office')
  const modulePath = join(item.profile, 'node_modules/dsh-univer-office')
  mkdirSync(target, { recursive: true })
  write(join(target, 'skills/sheets/SKILL.md'), 'managed sheets\n')
  const home = dirname(dirname(item.profile))
  syncManagedUniverSkills({ home, pluginRoot: target, active: true })
  assert.equal(existsSync(join(home, 'skills/sheets/SKILL.md')), true)
  mkdirSync(dirname(modulePath), { recursive: true })
  symlinkSync(target, modulePath, process.platform === 'win32' ? 'junction' : 'dir')
  write(join(item.profile, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-tender',
    private: true,
    dependencies: { 'dsh-univer-office': `link:${target}`, keep: '^1.0.0' },
    dsh: { profile: { bundles: ['dsh-univer-office', 'keep'] } },
  }, null, 2)}\n`)

  assert.deepEqual(detachInstalledUniverProfile({ profileDir: item.profile, productRoot: item.product }), {
    changed: true,
    removedModule: true,
    removedBundle: true,
  })
  const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.dependencies, { keep: '^1.0.0' })
  assert.deepEqual(manifest.dsh.profile.bundles, ['keep'])
  assert.equal(existsSync(modulePath), false)
  assert.equal(existsSync(join(home, 'skills/sheets/SKILL.md')), false)
})

test('uninstall preserves registry and unrelated local Univer installs byte-for-byte', (t) => {
  const item = fixture(t)
  const home = dirname(dirname(item.profile))
  const productPlugin = join(item.product, 'vendor/dsh-univer-office')
  write(join(productPlugin, 'skills/sheets/SKILL.md'), 'managed sheets\n')
  syncManagedUniverSkills({ home, pluginRoot: productPlugin, active: true })
  for (const spec of ['^0.2.10', `file:${join(item.root, 'another-product/vendor/dsh-univer-office')}`]) {
    const manifestPath = join(item.profile, 'package.json')
    const original = `${JSON.stringify({
      dependencies: { 'dsh-univer-office': spec },
      dsh: { profile: { bundles: ['dsh-univer-office'] } },
    }, null, 2)}\n`
    write(manifestPath, original)
    assert.deepEqual(detachInstalledUniverProfile({ profileDir: item.profile, productRoot: item.product }), {
      changed: false,
      removedModule: false,
      removedBundle: false,
    })
    assert.equal(readFileSync(manifestPath, 'utf8'), original)
    assert.equal(readFileSync(join(home, 'skills/sheets/SKILL.md'), 'utf8'), 'managed sheets\n')
  }
})

test('NSIS stages the old vendor before overlay, verifies before commit, and rolls back failures', () => {
  const stage = nsisSource.indexOf('Call StageUniverVendor')
  const extract = nsisSource.indexOf('7za.exe" x')
  const verify = nsisSource.indexOf('installer-univer-lifecycle.mjs" verify-product')
  const commit = nsisSource.indexOf('Call CommitUniverVendor')
  assert.ok(stage >= 0 && stage < extract)
  assert.ok(verify > extract && commit > verify)
  const stageBody = nsisSource.match(/Function StageUniverVendor([\s\S]*?)FunctionEnd/)?.[1] ?? ''
  assert.doesNotMatch(stageBody, /RMDir \/r "\$INSTDIR\\resources\\runtime\\product\\vendor\\\.agent-pi-univer-previous"/)
  assert.match(stageBody, /IfFileExists "\$INSTDIR\\resources\\runtime\\product\\vendor\\\.agent-pi-univer-previous\\\*\.\*"/)
  assert.match(nsisSource, /asar_restore:[\s\S]*Call RollbackUniverVendor/)
  assert.match(nsisSource, /extract_fail:[\s\S]*Call RollbackUniverVendor/)
  assert.match(nsisSource, /DetailPrint "Retrying extract[\s\S]*Pop \$0[\s\S]*\$0 != 0[\s\S]*Goto extract_fail/)
  assert.match(nsisSource, /Failed to repair plugin links[\s\S]*Call RollbackAppAsar|Call RollbackAppAsar[\s\S]*Failed to repair plugin links/)
  assert.match(nsisSource, /univer_verify_ok:[\s\S]*Call CommitUniverVendor[\s\S]*Delete "\$INSTDIR\\resources\\app\.asar\.old"/)
  const asarStageBody = nsisSource.match(/Function StageAppAsar([\s\S]*?)FunctionEnd/)?.[1] ?? ''
  assert.match(asarStageBody, /IfFileExists "\$INSTDIR\\resources\\app\.asar\.old" stage_asar_has_backup/)
  assert.doesNotMatch(asarStageBody, /Delete "\$INSTDIR\\resources\\app\.asar\.old"/)
  assert.match(nsisSource, /INCLUDE_LICENSED_UNIVER[\s\S]*verify-product[^\r\n]*--required/)
  assert.match(nsisSource, /un\.CloseRunningApp/)
  assert.match(nsisSource, /installer-univer-lifecycle\.mjs" detach-profile/)
  assert.match(nsisSource, /IfFileExists "\$INSTDIR\\\*\.\*" uninstall_delete_fail/)
})

test('NSIS accepts only a dedicated non-reparse install root and records its ownership', () => {
  const validate = nsisSource.match(/Function ValidateInstallRoot([\s\S]*?)FunctionEnd/)?.[1] ?? ''
  const validateUninstall = nsisSource.match(/Function un\.ValidateInstallRoot([\s\S]*?)FunctionEnd/)?.[1] ?? ''
  const installSection = nsisSource.match(/Section "Install"([\s\S]*?)SectionEnd/)?.[1] ?? ''
  const uninstallSection = nsisSource.match(/Section "Uninstall"([\s\S]*?)SectionEnd/)?.[1] ?? ''

  assert.match(nsisSource, /InstallDirRegKey HKCU "\$\{UNINST_KEY\}" "InstallLocation"/)
  assert.match(validate, /GetFullPathName \$INSTDIR "\$INSTDIR"/)
  assert.match(validate, /GetFileAttributesW/)
  assert.match(validate, /0x400/)
  assert.match(validate, /GetParent/)
  assert.match(validate, /\$3 != 0/)
  assert.match(validate, /\\Agent Pi DSH/)
  assert.match(validate, /agent-pi-DSH\.exe/)
  assert.match(validate, /resources\\app\.asar/)
  assert.match(validate, /INSTALL_ROOT_RECEIPT/)
  assert.match(validateUninstall, /GetFileAttributesW/)
  assert.match(validateUninstall, /0x400/)
  assert.match(validateUninstall, /GetParent/)
  assert.match(validateUninstall, /\$3 != 0/)
  assert.match(validateUninstall, /INSTALL_ROOT_RECEIPT/)
  assert.match(validateUninstall, /ReadRegStr[^\r\n]*InstallLocation/)
  assert.match(validateUninstall, /agent-pi-DSH\.exe/)
  assert.ok(installSection.indexOf('Call ValidateInstallRoot') < installSection.indexOf('Call StageAppAsar'))
  assert.match(installSection, /Call EnsureInstallRootReceipt/)
  assert.match(installSection, /WriteRegStr HKCU "\$\{UNINST_KEY\}" "InstallLocation" "\$INSTDIR"/)
  assert.ok(uninstallSection.indexOf('Call un.ValidateInstallRoot') < uninstallSection.indexOf('Call un.CloseRunningApp'))
})

test('NSIS uninstall fails closed before deleting the install root', () => {
  const uninstallSection = nsisSource.match(/Section "Uninstall"([\s\S]*?)SectionEnd/)?.[1] ?? ''
  const detach = uninstallSection.indexOf('installer-univer-lifecycle.mjs" detach-profile')
  const strip = uninstallSection.indexOf('repair-dsh-links.mjs" strip')
  const remove = uninstallSection.indexOf('RMDir /r "$INSTDIR"')

  assert.ok(detach >= 0 && strip > detach && remove > strip)
  assert.match(uninstallSection, /uninstall_helper_missing/)
  assert.match(uninstallSection, /uninstall_detach_failed/)
  assert.match(uninstallSection, /uninstall_strip_failed/)
  assert.match(uninstallSection, /detach-profile[^\r\n]*[\s\S]*Pop \$0[\s\S]*IntCmp \$0 0 uninstall_detach_ok/)
  assert.match(uninstallSection, /repair-dsh-links\.mjs" strip[^\r\n]*[\s\S]*Pop \$0[\s\S]*IntCmp \$0 0 uninstall_strip_ok/)
  assert.doesNotMatch(uninstallSection, /cmd\.exe" \/c rmdir|rmdir \/s \/q/i)
  assert.match(uninstallSection, /receipt or program files may already be gone; reinstall to the same directory/)
})
