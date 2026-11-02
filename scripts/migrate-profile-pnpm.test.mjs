import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { migrateProfilePnpm, profilePnpmLayout, requireManagedMigrationRange } from './migrate-profile-pnpm.mjs'

const oldCli = process.env.AGENT_PI_TEST_OLD_PNPM
const newCli = process.env.AGENT_PI_TEST_NEW_PNPM
const integration = oldCli && newCli && existsSync(oldCli) && existsSync(newCli)

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ap388-pnpm-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'profiles/tender')
  const dshRoot = fileURLToPath(new URL('../vendor/deepseek-harness', import.meta.url))
  const plugin = join(root, 'plugin')
  for (const dir of [profile, plugin]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'isolated-profile', private: true }))
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), `packages: []\nnodeLinker: hoisted\nstoreDir: ${join(root, 'new-store').replaceAll('\\', '/')}\n`)
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'migration-fixture', version: '1.0.0', main: 'index.cjs', dsh: { bundle: { patch: './cordis.patch.yml' } }, scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'INSTALL_SCRIPT_RAN\',\'bad\')"' } }))
  writeFileSync(join(plugin, 'index.cjs'), 'module.exports = 42\n')
  writeFileSync(join(plugin, 'cordis.patch.yml'), '- insert: []\n')
  const old = spawnSync(process.execPath, [oldCli, 'add', `file:${plugin}`, '--ignore-scripts', '--offline', '--store-dir', join(root, 'old-store')], {
    cwd: profile, encoding: 'utf8', timeout: 45000, windowsHide: true, env: { ...process.env, CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0' },
  })
  assert.equal(old.status, 0, old.stdout + old.stderr)
  assert.match(profilePnpmLayout(profile), /^pnpm@10\./)
  return { root, profile, plugin, dshRoot, options: { profileDir: profile, dshRoot, pnpmCli: newCli } }
}

test('real pnpm10 ->11 migration preserves pinned inputs and a loadable plugin, without lifecycle scripts', { skip: !integration }, async t => {
  const f = fixture(t)
  const inputs = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].map(name => [name, readFileSync(join(f.profile, name))])
  const result = await migrateProfilePnpm(f.options)
  assert.equal(result.status, 'migrated', JSON.stringify(result))
  assert.equal(profilePnpmLayout(f.profile), 'pnpm@11.28.5')
  const { load } = createRequire(join(f.dshRoot, 'vendor/include/package.json'))('js-yaml')
  assert.equal(load(readFileSync(join(f.profile, 'node_modules/.modules.yaml'), 'utf8')).storeDir.toLowerCase().startsWith(f.root.toLowerCase()), true)
  assert.equal(profilePnpmLayout(result.backup), result.previous)
  for (const [name, bytes] of inputs) assert.deepEqual(readFileSync(join(f.profile, name)), bytes)
  const entry = join(f.profile, 'node_modules/migration-fixture/index.cjs')
  assert.equal((await import(pathToFileURL(entry).href)).default, 42)
  assert.equal(existsSync(join(f.profile, 'node_modules/migration-fixture/INSTALL_SCRIPT_RAN')), false)
  assert.equal((await migrateProfilePnpm(f.options)).status, 'not-needed')
})

test('real frozen-install failure restores the original loadable tree and exact input bytes', { skip: !integration }, async t => {
  const f = fixture(t)
  const manifest = JSON.parse(readFileSync(join(f.profile, 'package.json'), 'utf8'))
  manifest.dependencies['migration-fixture'] = '9.9.9'
  writeFileSync(join(f.profile, 'package.json'), JSON.stringify(manifest))
  const inputs = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].map(name => [name, readFileSync(join(f.profile, name))])
  const originalModules = readFileSync(join(f.profile, 'node_modules/.modules.yaml'))
  const result = await migrateProfilePnpm(f.options)
  assert.equal(result.status, 'rolled-back', JSON.stringify(result))
  assert.ok(result.installCodes.includes('ERR_PNPM_OUTDATED_LOCKFILE'))
  for (const [name, bytes] of inputs) assert.deepEqual(readFileSync(join(f.profile, name)), bytes)
  assert.deepEqual(readFileSync(join(f.profile, 'node_modules/.modules.yaml')), originalModules)
  assert.equal((await import(pathToFileURL(join(f.profile, 'node_modules/migration-fixture/index.cjs')).href)).default, 42)
  assert.ok(existsSync(result.backup))
})

test('import-only and bundle-only entries survive migration, and pnpm hooks never execute', { skip: !integration }, async t => {
  const f = fixture(t)
  for (const name of ['import-only-fixture', 'bundle-only-fixture']) {
    const directory = join(f.root, name)
    mkdirSync(directory)
    const esm = name.startsWith('import')
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0',
      ...(esm ? { type: 'module', exports: { import: './index.mjs' } } : { dsh: { bundle: { patch: ['./cordis.patch.yml', './product-defaults.patch.yml'] } } }) }))
    writeFileSync(join(directory, esm ? 'index.mjs' : 'cordis.patch.yml'), esm ? 'export default 84\n' : '- insert: []\n')
    if (!esm) writeFileSync(join(directory, 'product-defaults.patch.yml'), '- insert: []\n')
    const installed = spawnSync(process.execPath, [oldCli, 'add', `file:${directory}`, '--offline', '--ignore-scripts', '--store-dir', join(f.root, 'old-store')], { cwd: f.profile, encoding: 'utf8', timeout: 45000, windowsHide: true, env: { ...process.env, CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0' } })
    assert.equal(installed.status, 0, installed.stdout + installed.stderr)
  }
  const hook = "require('fs').writeFileSync('PNPM_HOOK_RAN',JSON.stringify(process.argv)); module.exports = { hooks: { readPackage(pkg) { return pkg } } }\n"
  writeFileSync(join(f.profile, '.pnpmfile.cjs'), hook)
  writeFileSync(join(f.profile, 'global-hook.cjs'), hook)
  writeFileSync(join(f.profile, 'pnpm-workspace.yaml'), readFileSync(join(f.profile, 'pnpm-workspace.yaml'), 'utf8') + `globalPnpmfile: ${join(f.profile, 'global-hook.cjs').replaceAll('\\', '/')}\n`)
  const result = await migrateProfilePnpm(f.options)
  assert.equal(result.status, 'migrated', JSON.stringify(result))
  assert.equal(existsSync(join(f.profile, 'PNPM_HOOK_RAN')), false, existsSync(join(f.profile, 'PNPM_HOOK_RAN')) ? readFileSync(join(f.profile, 'PNPM_HOOK_RAN'), 'utf8') : '')
  const loaded = spawnSync(process.execPath, ['--input-type=module', '--eval', "import value from 'import-only-fixture'; if (value !== 84) process.exitCode = 1"], { cwd: f.profile, encoding: 'utf8', windowsHide: true })
  assert.equal(loaded.status, 0, loaded.stderr)
  assert.ok(existsSync(join(f.profile, 'node_modules/bundle-only-fixture/cordis.patch.yml')))
  assert.ok(existsSync(join(f.profile, 'node_modules/bundle-only-fixture/product-defaults.patch.yml')))
})

test('a bundle patch array with an unsafe item is rejected before the original tree moves', { skip: !integration }, async t => {
  const f = fixture(t)
  const path = join(f.profile, 'node_modules/migration-fixture/package.json')
  const original = JSON.parse(readFileSync(path, 'utf8'))
  const modules = readFileSync(join(f.profile, 'node_modules/.modules.yaml'))
  for (const invalid of ['../outside.patch.yml', null]) {
    writeFileSync(path, JSON.stringify({ ...original, dsh: { bundle: { patch: ['./cordis.patch.yml', invalid] } } }))
    const result = await migrateProfilePnpm(f.options)
    assert.equal(result.status, 'blocked')
    assert.equal(result.error, 'invalid-bundle-entry')
    assert.equal(result.originalTreeMoved, undefined)
    assert.deepEqual(readFileSync(join(f.profile, 'node_modules/.modules.yaml')), modules)
  }
})

test('missing local link lock entries reconcile without changing any registry resolution or original backup', { skip: !integration }, async t => {
  for (const failFrozenInstall of [false, true]) {
  const f = fixture(t)
  const local = join(f.root, 'product-link')
  mkdirSync(local)
  writeFileSync(join(local, 'package.json'), JSON.stringify({ name: 'product-link', version: '1.0.0', main: 'index.cjs' }))
  writeFileSync(join(local, 'index.cjs'), 'module.exports = 84\n')
  const added = spawnSync(process.execPath, [oldCli, 'add', `link:${local}`, '--offline', '--ignore-scripts', '--store-dir', join(f.root, 'old-store')], { cwd: f.profile, encoding: 'utf8', timeout: 45000, windowsHide: true, env: { ...process.env, CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0' } })
  assert.equal(added.status, 0, added.stdout + added.stderr)
  const { load, dump } = createRequire(join(f.dshRoot, 'vendor/include/package.json'))('js-yaml')
  const lockPath = join(f.profile, 'pnpm-lock.yaml'), expected = load(readFileSync(lockPath, 'utf8'))
  const stale = structuredClone(expected)
  delete stale.importers['.'].dependencies['product-link']
  const staleBytes = Buffer.from(dump(stale, { lineWidth: -1, noRefs: true }))
  writeFileSync(lockPath, staleBytes)
  if (failFrozenInstall) {
    const manifestPath = join(f.profile, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.dependencies['migration-fixture'] = '9.9.9'
    writeFileSync(manifestPath, JSON.stringify(manifest))
  }
  const modules = readFileSync(join(f.profile, 'node_modules/.modules.yaml'))
  const result = await migrateProfilePnpm(f.options)
  assert.deepEqual(result.reconciledLocalLinks, ['product-link'])
  if (failFrozenInstall) {
    assert.equal(result.status, 'rolled-back', JSON.stringify(result))
    assert.ok(result.installCodes.includes('ERR_PNPM_OUTDATED_LOCKFILE'))
    assert.deepEqual(readFileSync(lockPath), staleBytes)
    assert.deepEqual(readFileSync(join(f.profile, 'node_modules/.modules.yaml')), modules)
  } else {
    assert.equal(result.status, 'migrated', JSON.stringify(result))
    assert.deepEqual(load(readFileSync(lockPath, 'utf8')), expected)
  }
  assert.deepEqual(readFileSync(join(result.backup, 'pnpm-lock.yaml')), staleBytes)
  assert.equal((await import(pathToFileURL(join(f.profile, 'node_modules/product-link/index.cjs')).href)).default, 84)
  }
})

test('a redirected profile or modules root is rejected before modifying its target', { skip: !integration }, async t => {
  const f = fixture(t)
  const redirect = join(f.root, 'profiles/redirect')
  symlinkSync(f.profile, redirect, process.platform === 'win32' ? 'junction' : 'dir')
  const before = readFileSync(join(f.profile, 'node_modules/.modules.yaml'))
  assert.equal((await migrateProfilePnpm({ ...f.options, profileDir: redirect })).status, 'recovery-required')
  assert.deepEqual(readFileSync(join(f.profile, 'node_modules/.modules.yaml')), before)
  assert.equal(realpathSync(redirect), realpathSync(f.profile))
})

test('fresh profile without pnpm metadata needs no migration or package-manager probe', async t => {
  const root = mkdtempSync(join(tmpdir(), 'ap388-fresh-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal((await migrateProfilePnpm({ profileDir: root, dshRoot: join(root, 'absent') })).status, 'not-needed')
})

test('a nonlocal workspace is blocked without touching dependencies or the other project', { skip: !integration }, async t => {
  const f = fixture(t)
  const bytes = readFileSync(join(f.profile, 'node_modules/.modules.yaml'))
  writeFileSync(join(f.profile, 'pnpm-workspace.yaml'), 'packages: [., ../../another-project]\n')
  const result = await migrateProfilePnpm(f.options)
  assert.equal(result.status, 'blocked')
  assert.equal(result.error, 'profile-workspace-scope-not-local')
  assert.deepEqual(readFileSync(join(f.profile, 'node_modules/.modules.yaml')), bytes)
  assert.equal(existsSync(join(f.root, 'another-project')), false)
})

test('DSH forced fallback cannot spawn a migration process', { skip: !integration }, async t => {
  const f = fixture(t)
  const require = createRequire(join(f.dshRoot, 'apps/cli/package.json'))
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const { default: Subprocess } = await import(pathToFileURL(join(f.dshRoot, 'packages/subprocess/subprocess-local/lib/index.js')).href)
  const ctx = new Context()
  await ctx.plugin(Subprocess)
  t.after(() => ctx.fiber.dispose())
  requireManagedMigrationRange(ctx.subprocess)
  ctx.subprocess.internals.platform = 'darwin'
  assert.throws(() => ctx.subprocess.spawn({ argv: [process.execPath, '--eval', "require('fs').writeFileSync('UNOWNED_CHILD_RAN','bad')"], cwd: f.profile,
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 2000 }), /weaker-migration-containment-refused/)
  assert.equal(existsSync(join(f.profile, 'UNOWNED_CHILD_RAN')), false)
})

test('pnpm directory overrides cannot move the install outside the current profile', { skip: !integration }, async t => {
  const f = fixture(t)
  const outside = join(f.root, 'untouched')
  mkdirSync(outside)
  writeFileSync(join(outside, 'KEEP'), 'original bytes')
  const workspace = join(f.profile, 'pnpm-workspace.yaml')
  writeFileSync(workspace, readFileSync(workspace, 'utf8') + `modulesDir: ${join(outside, 'modules').replaceAll('\\', '/')}\nvirtualStoreDir: ${join(outside, 'virtual').replaceAll('\\', '/')}\nlockfileDir: ${join(outside, 'locks').replaceAll('\\', '/')}\n`)
  const before = readFileSync(workspace)
  const result = await migrateProfilePnpm(f.options)
  assert.equal(result.status, 'migrated', JSON.stringify(result))
  assert.equal(readFileSync(join(outside, 'KEEP'), 'utf8'), 'original bytes')
  for (const name of ['modules', 'virtual', 'locks']) assert.equal(existsSync(join(outside, name)), false)
  assert.deepEqual(readFileSync(workspace), before)
  assert.ok(existsSync(join(f.profile, 'node_modules/migration-fixture/index.cjs')))
})

test('actual official DSH CLI can upgrade a neutral plugin after migration', { skip: !integration }, async t => {
  const f = fixture(t)
  const migration = await migrateProfilePnpm(f.options)
  assert.equal(migration.status, 'migrated', JSON.stringify(migration))
  const next = JSON.parse(readFileSync(join(f.plugin, 'package.json'), 'utf8'))
  next.version = '2.0.0'
  const nextDirectory = join(f.root, 'plugin-v2')
  mkdirSync(nextDirectory)
  writeFileSync(join(nextDirectory, 'package.json'), JSON.stringify(next))
  writeFileSync(join(nextDirectory, 'index.cjs'), 'module.exports = 84\n')
  writeFileSync(join(nextDirectory, 'cordis.patch.yml'), '- insert: []\n')
  const env = { ...process.env, DSH_HOME: f.root, DSH_CHECKOUT: f.dshRoot, CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0' }
  const inheritedPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? ''
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key]
  env.PATH = dirname(process.execPath) + delimiter + inheritedPath
  const upgraded = spawnSync(process.execPath, [join(f.dshRoot, 'apps/cli/lib/bin.js'), 'plugin', '--profile', 'tender', 'add', `file:${nextDirectory}`, '--offline', '--ignore-scripts', '--ignore-pnpmfile'], {
    cwd: f.root, encoding: 'utf8', timeout: 45000, windowsHide: true, env,
  })
  assert.equal(upgraded.status, 0, upgraded.stdout + upgraded.stderr)
  assert.equal(JSON.parse(readFileSync(join(f.profile, 'node_modules/migration-fixture/package.json'), 'utf8')).version, '2.0.0')
  const loaded = spawnSync(process.execPath, ['--eval', "if(require('migration-fixture') !== 84) process.exitCode=1"], { cwd: f.profile, encoding: 'utf8', windowsHide: true })
  assert.equal(loaded.status, 0, loaded.stderr)
  assert.ok(existsSync(join(migration.backup, 'node_modules/migration-fixture/package.json')))
  assert.equal(JSON.parse(readFileSync(join(migration.backup, 'node_modules/migration-fixture/package.json'), 'utf8')).version, '1.0.0')
})

test('interrupted migration cannot treat the moved tree as an empty fresh profile', { skip: !integration }, async t => {
  const f = fixture(t)
  const backup = join(f.root, 'profiles/.agent-pi-pnpm-backups/interrupted')
  mkdirSync(backup, { recursive: true })
  const before = readFileSync(join(f.profile, 'node_modules/.modules.yaml'))
  renameSync(join(f.profile, 'node_modules'), join(backup, 'node_modules'))
  for (const status of ['pending', 'recovery-required']) {
    const bytes = JSON.stringify({ status, backup, previous: 'pnpm@10.24.0', target: 'pnpm@11.28.5' })
    writeFileSync(join(f.profile, '.agent-pi-pnpm-migration.json'), bytes)
    const result = await migrateProfilePnpm(f.options)
    assert.equal(result.status, 'recovery-required')
    assert.equal(result.error, 'previous-migration-not-settled')
    assert.equal(existsSync(join(f.profile, 'node_modules')), false)
    assert.deepEqual(readFileSync(join(backup, 'node_modules/.modules.yaml')), before)
    assert.equal(readFileSync(join(f.profile, '.agent-pi-pnpm-migration.json'), 'utf8'), bytes)
  }
})
