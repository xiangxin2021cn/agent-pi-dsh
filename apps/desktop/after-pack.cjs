const { spawnSync } = require('node:child_process')
const { copyFileSync, existsSync, lstatSync, realpathSync, rmSync } = require('node:fs')
const { isAbsolute, join, relative, resolve, sep } = require('node:path')

const isWindows = process.platform === 'win32'

function syncRuntimeWindows(src, dest) {
  const result = spawnSync('robocopy', [
    src,
    dest,
    '/E',
    '/SL',
    '/SJ',
    '/MT:16',
    '/R:1',
    '/W:1',
    '/XD',
    '.trash',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/nc',
    '/ns',
    '/np',
  ], { windowsHide: true })
  const code = result.status ?? 1
  if (code >= 8) throw new Error(`robocopy failed (${code}) ${src} -> ${dest}`)
}

function syncRuntimePosix(src, dest) {
  // -P preserves pnpm's relative symlinks inside node_modules; dereferencing
  // them would balloon the bundle and break workspace resolution.
  const mk = spawnSync('mkdir', ['-p', dest])
  if (mk.status !== 0) throw new Error(`mkdir -p failed for ${dest}`)
  const result = spawnSync('cp', ['-RP', `${src}/.`, dest], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`cp -RP failed (${result.status}) ${src} -> ${dest}\n${result.stderr || ''}`)
  }
}

function contains(parent, path) {
  const child = relative(parent, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

function samePath(left, right) {
  return isWindows ? left.toLowerCase() === right.toLowerCase() : left === right
}

function syncRuntime(src, dest, appOutDir) {
  if (typeof appOutDir !== 'string' || !appOutDir) throw new Error('runtime sync requires its managed appOutDir')
  const source = resolve(src), target = resolve(dest), output = resolve(appOutDir)
  for (const path of [source, output]) {
    const entry = lstatSync(path)
    if (!entry.isDirectory() || entry.isSymbolicLink() || !samePath(realpathSync(path), path)) throw new Error('runtime source/output root must be a real directory without aliases')
  }
  const child = relative(output, target).split(sep).join('/')
  if (child !== 'resources/runtime' && !/^[^/]+\.app\/Contents\/Resources\/runtime$/.test(child)) throw new Error('runtime destination must be the managed appOutDir resources/runtime')
  if (contains(source, target) || contains(target, source)) throw new Error('runtime source and destination must not overlap')
  let ancestor = output
  for (const part of child.split('/')) {
    ancestor = join(ancestor, part)
    const entry = lstatSync(ancestor, { throwIfNoEntry: false })
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink() || !samePath(realpathSync(ancestor), ancestor))) throw new Error('runtime destination ancestor/root must not be a link or alias')
  }
  // The resolved target is the fixed candidate runtime, outside the source.
  // rm unlinks nested junctions/symlinks without traversing their targets.
  if (existsSync(target)) rmSync(target, { recursive: true, maxRetries: 3 })
  if (isWindows) syncRuntimeWindows(source, target)
  else syncRuntimePosix(source, target)
}

function repairPackedLinks(dest) {
  // Windows-only: junctions embedded in the staged runtime record absolute
  // paths, so the packed copy re-points them. POSIX symlinks are relative and
  // survive the copy untouched.
  const node = join(dest, 'node', 'node.exe')
  const script = join(dest, 'product', 'scripts', 'repair-dsh-links.mjs')
  const dsh = join(dest, 'deepseek-harness')
  if (!existsSync(node) || !existsSync(script) || !existsSync(join(dsh, '.agent-pi-links.json'))) {
    throw new Error(`cannot repair dsh links under ${dest}`)
  }
  const result = spawnSync(node, [script, 'repair', dsh], {
    cwd: join(dest, 'product'),
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    throw new Error(`dsh link repair failed: ${result.stderr || result.status}`)
  }
}

function assertRuntime(dest) {
  const dsh = join(dest, 'deepseek-harness')
  const nodeBin = join(dest, 'node', isWindows ? 'node.exe' : 'node')
  const need = [
    join(dsh, 'package.json'),
    join(dsh, 'apps', 'web', 'dist', 'index.html'),
    join(dsh, 'apps', 'cli', 'lib', 'bin.js'),
    // --prod workspace installs link @deepseek-ai under apps/cli, not the root.
    join(dsh, 'node_modules', '.pnpm'),
    join(dsh, 'apps', 'cli', 'node_modules', '@deepseek-ai'),
    join(dsh, 'apps', 'cli', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'package.json'),
    join(dest, 'product', 'scripts', 'init-tender-profile.mjs'),
    nodeBin,
  ]
  const missing = need.filter((path) => !existsSync(path))
  if (missing.length > 0) {
    throw new Error(`runtime incomplete:\n${missing.join('\n')}`)
  }
  // Production bundles launch built bin.js and resolve this CLI workspace link.
  const probeTarget = join(dsh, 'apps', 'cli', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
  const probe = spawnSync(nodeBin, ['-e', 'console.log(require("fs").realpathSync(process.argv[1]))', probeTarget], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const real = String(probe.stdout || '').trim()
  const child = relative(resolve(dest), real)
  if (probe.status !== 0 || !real || isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) {
    throw new Error(`dsh dependency escaped the packed runtime:\n${real || probe.stderr}`)
  }
}

module.exports = async function afterPack(context) {
  const src = join(context.packager.projectDir, 'runtime')
  // macOS keeps app payload under Contents/Resources inside the .app bundle.
  const dest = context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'runtime')
    : join(context.appOutDir, 'resources', 'runtime')
  console.log(`afterPack: syncing runtime -> ${dest}`)
  syncRuntime(src, dest, context.appOutDir)
  if (isWindows) {
    console.log('afterPack: repairing dsh junctions inside packed runtime')
    repairPackedLinks(dest)
  }
  assertRuntime(dest)
  const ico = join(context.packager.projectDir, 'build', 'icon.ico')
  const png = join(context.packager.projectDir, 'brand', 'app-icon.png')
  if (isWindows && existsSync(ico)) {
    copyFileSync(ico, join(context.appOutDir, 'app-icon.ico'))
    copyFileSync(ico, join(context.appOutDir, 'agent-pi-DSH.ico'))
    copyFileSync(ico, join(dest, '..', 'app-icon.ico'))
  }
  if (existsSync(png)) {
    copyFileSync(png, join(dest, '..', 'app-icon.png'))
    if (isWindows) copyFileSync(png, join(context.appOutDir, 'app-icon.png'))
  }
}

module.exports.syncRuntime = syncRuntime
module.exports.assertRuntime = assertRuntime
