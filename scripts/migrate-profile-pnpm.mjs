import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']
const major = value => /^pnpm@(\d+)\./.exec(value ?? '')?.[1]

export function profilePnpmLayout(profile) {
  const file = join(profile, 'node_modules/.modules.yaml')
  if (!existsSync(file)) return null
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw new Error('unsafe-modules-metadata')
  const text = readFileSync(file, 'utf8')
  if (text.length > 4 * 1024 * 1024) throw new Error('modules-metadata-too-large')
  try { return JSON.parse(text).packageManager ?? null } catch {}
  return /^packageManager:\s*['"]?(pnpm@\d+\.\d+\.\d+)['"]?\s*$/m.exec(text)?.[1] ?? null
}

function localDirectory(directory) {
  const absolute = resolve(directory)
  if (!isAbsolute(directory) || absolute === parse(absolute).root) throw new Error('unsafe-profile-path')
  let current = parse(absolute).root
  for (const segment of relative(current, absolute).split(/[\\/]/)) {
    current = join(current, segment)
    const stat = lstatSync(current)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('linked-profile-path')
  }
  if (resolve(realpathSync(absolute)).toLowerCase() !== absolute.toLowerCase()) throw new Error('redirected-profile-path')
}

/** The fixed DSH runtime calls this public seam only on its weaker fallback. */
export function requireManagedMigrationRange(runtime) {
  if (readFileSync(new URL('../DSH_PIN', import.meta.url), 'utf8').trim() !== '39163dd30f703a79079e2d2446545cff3c453738') throw new Error('unreviewed-migration-runtime')
  if (!runtime.internals || typeof runtime.internals !== 'object') throw new Error('managed-range-admission-unavailable')
  runtime.internals = { ...runtime.internals, spawn() { throw new Error('weaker-migration-containment-refused') } }
}

function dependencyEntries(profile) {
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  const names = Object.keys(manifest.dependencies ?? {}).sort()
  const packages = names.map(name => {
    if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(name)) throw new Error('invalid-dependency-name')
    const directory = join(profile, 'node_modules', name)
    const info = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    const rootExport = typeof info.exports === 'string' || info.exports?.['.'] ||
      (info.exports && Object.keys(info.exports).some(key => !key.startsWith('.')))
    return { name, directory, info, resolveEntry: Boolean(info.main || rootExport) }
  })
  // Use Node's import conditions (including import-only exports), without
  // importing or executing any plugin. Bundle-only packages need no JS entry.
  const queries = packages.filter(item => item.resolveEntry).map(item => item.name)
  const script = "import { readFileSync } from 'node:fs'; const { names, parent } = JSON.parse(readFileSync(0, 'utf8')); console.log(JSON.stringify(names.map(name => import.meta.resolve(name, parent))));"
  const resolution = spawnSync(process.execPath, ['--experimental-import-meta-resolve', '--input-type=module', '--eval', script], {
    input: JSON.stringify({ names: queries, parent: pathToFileURL(join(profile, 'package.json')).href }),
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  })
  if (resolution.status !== 0) throw new Error('dependency-import-resolution-failed')
  const resolvedEntries = JSON.parse(resolution.stdout)
  const entries = new Map(queries.map((name, index) => [name, new URL(resolvedEntries[index])]))
  return packages.map(({ name, directory, info }) => {
    const entry = entries.get(name)
    const patch = info.dsh?.bundle?.patch
    if (patch) {
      for (const path of Array.isArray(patch) ? patch : [patch]) {
        if (typeof path !== 'string' || !path || isAbsolute(path) || relative(directory, resolve(directory, path)).startsWith('..')) throw new Error('invalid-bundle-entry')
        if (!lstatSync(resolve(directory, path)).isFile()) throw new Error('missing-bundle-entry')
      }
    }
    if (entry && !lstatSync(entry).isFile()) throw new Error('missing-runtime-entry')
    return { name, version: info.version, entry: entry ? relative(realpathSync(directory), fileURLToPath(entry)) : null, patch: patch ?? null }
  })
}

/** Migrate only an older pnpm major before DSH loads any profile plugin. */
export async function migrateProfilePnpm({ profileDir, dshRoot, nodeExecutable = process.execPath, pnpmCli = join(dirname(nodeExecutable), 'node_modules/pnpm/bin/pnpm.cjs') }) {
  const receipt = join(profileDir, '.agent-pi-pnpm-migration.json')
  try {
    localDirectory(profileDir)
    if (existsSync(receipt)) {
      const stat = lstatSync(receipt)
      if (!stat.isFile() || stat.nlink > 1 || stat.size > 65536) throw new Error('unsafe-migration-receipt')
      const saved = JSON.parse(readFileSync(receipt, 'utf8'))
      if (saved.status === 'pending' || saved.status === 'recovery-required') return {
        status: 'recovery-required', error: 'previous-migration-not-settled', backup: saved.backup,
        previous: saved.previous, target: saved.target,
      }
    }
  } catch { return { status: 'recovery-required', error: 'migration-state-unreadable' } }
  if (!existsSync(join(profileDir, 'node_modules/.modules.yaml'))) return { status: 'not-needed', previous: null, target: null }
  try { localDirectory(profileDir); localDirectory(join(profileDir, 'node_modules')) } catch (error) { return { status: 'blocked', error: error.message } }
  const target = JSON.parse(readFileSync(join(dshRoot, 'package.json'), 'utf8')).packageManager
  const previous = profilePnpmLayout(profileDir)
  if (!major(previous) || !major(target) || Number(major(previous)) >= Number(major(target))) return { status: 'not-needed', previous, target }
  let backup
  let context
  let originalEntries
  const originals = new Map()
  const result = { status: 'blocked', previous, target }
  const record = () => {
    if (existsSync(receipt) && !lstatSync(receipt).isFile()) throw new Error('unsafe-migration-receipt')
    const pending = join(profileDir, `.agent-pi-pnpm-migration-${randomUUID()}.json`)
    writeFileSync(pending, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    renameSync(pending, receipt)
  }
  try {
    if (basename(dirname(profileDir)) !== 'profiles') throw new Error('unexpected-profile-parent')
    localDirectory(profileDir)
    localDirectory(join(profileDir, 'node_modules'))
    if (existsSync(receipt) && !lstatSync(receipt).isFile()) throw new Error('unsafe-migration-receipt')
    if (!existsSync(pnpmCli)) throw new Error('bundled-package-manager-missing')
    if (`pnpm@${JSON.parse(readFileSync(join(dirname(pnpmCli), '../package.json'), 'utf8')).version}` !== target) throw new Error('bundled-package-manager-mismatch')
    const require = createRequire(join(dshRoot, 'apps/cli/package.json'))
    const { load, dump, JSON_SCHEMA } = createRequire(join(dshRoot, 'vendor/include/package.json'))('js-yaml')
    const workspacePath = join(profileDir, 'pnpm-workspace.yaml')
    if (!existsSync(workspacePath) || !lstatSync(workspacePath).isFile()) throw new Error('profile-workspace-boundary-missing')
    const workspace = load(readFileSync(workspacePath, 'utf8'), { schema: JSON_SCHEMA })
    if (!Array.isArray(workspace?.packages) || workspace.packages.some(pattern => pattern !== '.')) throw new Error('profile-workspace-scope-not-local')
    if (process.platform === 'win32') {
      const runner = createRequire(join(dshRoot, 'packages/subprocess/subprocess-local/package.json')).resolve('@deepseek-ai/dsh-subprocess-local/runner')
      accessSync(nodeExecutable, constants.X_OK)
      accessSync(runner, constants.R_OK)
      const native = await import(pathToFileURL(join(dshRoot, 'packages/subprocess/win32-process/lib/index.js')).href)
      native.probeCurrentTokenJobSupport(native.loadWin32ProcessBindings())
    }
    const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
    const { default: Subprocess } = await import(pathToFileURL(join(dshRoot, 'packages/subprocess/subprocess-local/lib/index.js')).href)
    context = new Context()
    await context.plugin(Subprocess)
    requireManagedMigrationRange(context.subprocess)
    const runManaged = async (argv, timeoutMs) => {
      const child = context.subprocess.spawn({ argv, cwd: profileDir,
        env: { CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0', PNPM_CONFIG_IGNORE_PNPMFILE: 'true', npm_config_ignore_pnpmfile: 'true', npm_config_ignore_scripts: 'true' },
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 2000 })
      let stdout = '', stderr = '', timedOut = false, outcome
      child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-65536) })
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-65536) })
      const timer = setTimeout(() => { timedOut = true; child.terminate() }, timeoutMs)
      try {
        try { outcome = await child.done } catch { child.terminate() }
        try { await child.waitForExit() } catch {
          const error = new Error('owned-range-not-quiescent')
          error.unsafeToRollback = true
          throw error
        }
      } finally {
        clearTimeout(timer)
      }
      return { exitCode: outcome?.exitCode, stdout, stderr, timedOut, quiescent: true }
    }
    // pnpm --version can load profile hooks before processing ignore options.
    // Probe the owned range with pure Node; the pnpm package pin was read above.
    const probe = await runManaged([nodeExecutable, '--eval', "process.stdout.write('owned-pnpm-migration')"], 15000)
    if (probe.exitCode !== 0 || probe.timedOut || probe.stdout !== 'owned-pnpm-migration') throw new Error('managed-range-probe-failed')
    if (!existsSync(join(profileDir, 'pnpm-lock.yaml'))) throw new Error('frozen-lockfile-missing')
    for (const file of FILES) {
      const path = join(profileDir, file)
      if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).nlink > 1)) throw new Error('linked-profile-file')
      originals.set(file, existsSync(path) ? readFileSync(path) : null)
    }
    originalEntries = dependencyEntries(profileDir)
    const expectedInputs = new Map(originals)
    const manifest = JSON.parse(originals.get('package.json').toString('utf8'))
    const lock = load(originals.get('pnpm-lock.yaml').toString('utf8'), { schema: JSON_SCHEMA })
    const importer = lock?.importers?.['.']
    if (importer && lock.settings?.excludeLinksFromLockfile !== true) {
      const missingLinks = Object.entries(manifest.dependencies ?? {}).filter(([name, spec]) =>
        typeof spec === 'string' && spec.startsWith('link:') && !Object.hasOwn(importer.dependencies ?? {}, name))
      if (missingLinks.length) {
        // Prior product initialization linked these packages without updating the
        // importer. Add only their declared local references, never a resolution.
        importer.dependencies = { ...importer.dependencies, ...Object.fromEntries(missingLinks.map(([name, spec]) => [name, {
          specifier: spec, version: 'link:' + (relative(profileDir, resolve(profileDir, spec.slice(5))).replaceAll('\\', '/') || '.'),
        }])) }
        expectedInputs.set('pnpm-lock.yaml', Buffer.from(dump(lock, { lineWidth: -1, noRefs: true })))
        result.reconciledLocalLinks = missingLinks.map(([name]) => name)
      }
    }
    const backups = join(dirname(profileDir), '.agent-pi-pnpm-backups')
    if (!existsSync(backups)) mkdirSync(backups)
    localDirectory(backups)
    backup = join(backups, `${basename(profileDir)}-${randomUUID()}`)
    mkdirSync(backup)
    result.backup = backup
    for (const [file, bytes] of originals) if (bytes !== null) writeFileSync(join(backup, file), bytes, { flag: 'wx' })
    result.inputSha256 = Object.fromEntries([...originals].map(([file, bytes]) => [file, bytes === null ? null : createHash('sha256').update(bytes).digest('hex')]))
    result.originalModulesSha256 = createHash('sha256').update(readFileSync(join(profileDir, 'node_modules/.modules.yaml'))).digest('hex')
    result.status = 'pending'
    record()
    // Keep the entire old tree, including already-built native dependencies.
    renameSync(join(profileDir, 'node_modules'), join(backup, 'node_modules'))
    result.originalTreeMoved = true
    if (result.reconciledLocalLinks) writeFileSync(join(profileDir, 'pnpm-lock.yaml'), expectedInputs.get('pnpm-lock.yaml'))
    const run = await runManaged([nodeExecutable, pnpmCli, 'install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile',
      `--dir=${profileDir}`, '--modules-dir=node_modules', '--virtual-store-dir=node_modules/.pnpm', `--lockfile-dir=${profileDir}`, '--recursive=false'], 180000)
    result.managedRangeQuiescent = run.quiescent
    if (run.exitCode !== 0 || run.timedOut) {
      result.installCodes = [...new Set((run.stdout + run.stderr).match(/ERR_[A-Z_]+/g) ?? [])]
      throw new Error(run.timedOut ? 'migration-timeout' : 'frozen-install-failed')
    }
    if (profilePnpmLayout(profileDir) !== target) throw new Error('installed-layout-mismatch')
    for (const [file, bytes] of expectedInputs) {
      const path = join(profileDir, file)
      if (bytes !== null ? !existsSync(path) || !readFileSync(path).equals(bytes) : existsSync(path)) throw new Error('profile-input-changed')
    }
    if (JSON.stringify(dependencyEntries(profileDir)) !== JSON.stringify(originalEntries)) throw new Error('dependency-entry-changed')
    result.status = 'migrated'
    result.verifiedEntries = originalEntries.length
    // Retain the previous working closure for diagnosis / deliberate recovery.
    record()
    return result
  } catch (error) {
    result.error = error.message
    if (result.status === 'pending' && !result.originalTreeMoved) result.status = 'recovery-required'
    if (result.originalTreeMoved && error.unsafeToRollback) {
      result.status = 'recovery-required'
      result.rollbackError = 'owned-range-not-quiescent'
    } else if (result.originalTreeMoved) {
      try {
        localDirectory(profileDir)
        if (existsSync(join(profileDir, 'node_modules'))) {
          localDirectory(join(profileDir, 'node_modules'))
          renameSync(join(profileDir, 'node_modules'), join(backup, 'failed-node_modules'))
        }
        for (const [file, bytes] of originals) {
          const path = join(profileDir, file)
          if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).nlink > 1)) throw new Error('unsafe-rollback-file')
          if (bytes !== null) writeFileSync(path, bytes)
          else if (existsSync(path)) unlinkSync(path)
        }
        renameSync(join(backup, 'node_modules'), join(profileDir, 'node_modules'))
        for (const [file, bytes] of originals) {
          const path = join(profileDir, file)
          if (bytes !== null ? !readFileSync(path).equals(bytes) : existsSync(path)) throw new Error('rollback-input-mismatch')
        }
        if (profilePnpmLayout(profileDir) !== previous || JSON.stringify(dependencyEntries(profileDir)) !== JSON.stringify(originalEntries)) throw new Error('rollback-entry-mismatch')
        result.status = 'rolled-back'
      } catch (rollback) {
        result.status = 'recovery-required'
        result.rollbackError = rollback.message
      }
    }
    // A rejected path is never used for any write, including a diagnostic.
    if (backup) record()
    return result
  } finally {
    if (context) await context.fiber.dispose()
  }
}
