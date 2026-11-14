import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { repairLinks } from './repair-dsh-links.mjs'

const policyFile = fileURLToPath(new URL('./dsh-distribution-policy.json', import.meta.url))
export const distributionPolicy = JSON.parse(readFileSync(policyFile, 'utf8'))
export const distributionReceipt = 'node_modules/.agent-pi-selected-production.json'
const inputReceipt = '.agent-pi-distribution-input.json'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const slash = path => path.split(sep).join('/')
const hashFile = path => sha(readFileSync(path))
const writeJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n') }

function inside(root, path) {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep))
}

export function isSelectedMainline(product) {
  return !!product && readJson(join(product, 'package.json')).agentPiProduct?.edition === 'mainline'
}

export function excludedRuntimePackage(name) {
  return distributionPolicy.excludedPackages.some(base => name === base || name.startsWith(base + '-')) ||
    Object.values(distributionPolicy.excludedWorkspaces).includes(name)
}

export function verifySelectedProfile(entries) {
  if (!Array.isArray(entries)) throw new Error('Selected profile entries must be an array')
  let oar = false, host = false
  const visit = rows => { for (const row of rows) {
    if (!row || typeof row !== 'object' || row.disabled === true) continue
    const name = String(row.name || '')
    if (Object.values(distributionPolicy.excludedWorkspaces).includes(name) ||
      /(?:^|\/)codex-(?:provider|tool)$/.test(name)) throw new Error(`Selected profile activates an excluded provider: ${name}`)
    if (name === 'dsh-tender-host') host = true
    if (['@deepseek-ai/dsh-experimental-subagent-oar', '@deepseek-ai/dsh-experimental-tool-subagent-oar'].includes(name)) oar = true
    if (Array.isArray(row.config)) visit(row.config)
    if (Array.isArray(row.config?.plugins)) visit(row.config.plugins)
  } }
  visit(entries)
  if (oar && !host) throw new Error('Selected OAR delegation requires the active product host permission guard')
  return { policy: distributionPolicy.id }
}

/** Copy only omitted workspace manifests from the exact clean source, never runtime code or dependencies. */
export function stageDistributionManifests(dshRoot, product, sourceRoot) {
  const dsh = realpathSync(dshRoot), source = realpathSync(sourceRoot)
  if (dsh === source || inside(dsh, source) || inside(source, dsh)) throw new Error('Runtime metadata must be staged outside the original DSH source')
  const git = (args, input) => {
    const result = spawnSync('git', ['-C', source, ...args], { input, encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) throw new Error('Original DSH source metadata could not be verified')
    return result.stdout.trim()
  }
  if (git(['rev-parse', 'HEAD']) !== distributionPolicy.sourceCommit || readFileSync(join(product, 'DSH_PIN'), 'utf8').trim() !== distributionPolicy.sourceCommit) throw new Error('Workspace metadata requires the fixed DSH source pin')
  if (realpathSync(git(['rev-parse', '--show-toplevel'])).toLowerCase() !== source.toLowerCase() || git(['status', '--porcelain=v1', '--untracked-files=all'])) throw new Error('Workspace metadata requires the exact clean DSH source checkout')
  for (const name of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) if (!readFileSync(join(dsh, name)).equals(readFileSync(join(source, name)))) throw new Error(`Runtime metadata input differs from original DSH: ${name}`)
  const lock = yamlParser(product).load(readFileSync(join(source, 'pnpm-lock.yaml'), 'utf8'))
  const missing = [], checked = []
  for (const importer of Object.keys(lock.importers)) {
    const path = join(importer, 'package.json'), original = resolve(source, path), target = resolve(dsh, path)
    if (!inside(source, original) || !inside(dsh, target) || !lstatSync(original).isFile()) throw new Error('Workspace manifest escaped its source/runtime')
    let directory = dsh
    for (const part of relative(dsh, dirname(target)).split(sep).filter(Boolean)) {
      directory = join(directory, part)
      if (existsSync(directory) && (lstatSync(directory).isSymbolicLink() || !inside(dsh, realpathSync(directory)))) throw new Error('Workspace manifest ancestor is linked outside the managed runtime')
    }
    const bytes = readFileSync(original)
    if (existsSync(target)) {
      if (!lstatSync(target).isFile() || !readFileSync(target).equals(bytes)) throw new Error(`Existing runtime workspace manifest differs: ${path}`)
    } else {
      const gitPath = slash(path)
      if (git(['hash-object', '--path=' + gitPath, '--stdin'], bytes) !== git(['rev-parse', 'HEAD:' + gitPath])) throw new Error('Omitted workspace manifest differs from its pinned Git source')
      missing.push({ path, target, bytes })
    }
    checked.push(slash(path))
  }
  for (const { target, bytes } of missing) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' }) }
  return { sourceCommit: distributionPolicy.sourceCommit, checked: checked.length, added: missing.map(({ path, bytes }) => ({ path: slash(path), sha256: sha(bytes) })) }
}

function yamlParser(product) {
  return createRequire(join(product, 'bundles/tender-host/package.json'))('js-yaml')
}

// Only install inputs change, in a separate owned workspace. The shipped source,
// workspace, lock, and official build receipt remain byte-for-byte upstream.
export function deriveDistributionInputs(dsh, product) {
  const yaml = yamlParser(product)
  const workspaceText = readFileSync(join(dsh, 'pnpm-workspace.yaml'), 'utf8')
  const lockText = readFileSync(join(dsh, 'pnpm-lock.yaml'), 'utf8')
  const workspace = yaml.load(workspaceText), lock = yaml.load(lockText)
  const excluded = distributionPolicy.excludedWorkspaces
  for (const [path, name] of Object.entries(excluded)) {
    if (!lock.importers?.[path] || readJson(join(dsh, path, 'package.json')).name !== name) throw new Error(`Distribution importer differs from reviewed upstream: ${path}`)
  }
  const manifests = {}
  for (const path of Object.keys(lock.importers)) {
    const file = join(dsh, path, 'package.json')
    const manifest = readJson(file)
    manifests[path] = hashFile(file)
    if (path in excluded) continue
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
      if (excludedRuntimePackage(name)) throw new Error(`Active importer still requires excluded runtime: ${path} -> ${name}`)
    }
  }
  for (const path of distributionPolicy.requiredWorkspaces) if (!lock.importers[path]) throw new Error(`OAR workspace missing: ${path}`)
  workspace.packages.push(...Object.keys(excluded).map(path => '!' + path))
  const derivedWorkspace = yaml.dump(workspace, { lineWidth: -1, noRefs: true })
  // Preserve every locked package/snapshot and every remaining importer exactly.
  // Removing the two precise importer blocks makes pnpm's recursive prod install
  // omit their dependency roots without synthesizing package integrity values.
  let derivedLock = lockText
  for (const path of Object.keys(excluded)) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`^  ${escaped}:(?:[ \\t]*\\{\\}[ \\t]*\\r?\\n|[ \\t]*\\r?\\n[\\s\\S]*?(?=^  \\S|^\\S|$(?![\\s\\S])))`, 'm')
    if (!pattern.test(derivedLock)) throw new Error(`Unsupported lock importer layout: ${path}`)
    derivedLock = derivedLock.replace(pattern, '')
  }
  const expected = structuredClone(lock)
  for (const path of Object.keys(excluded)) delete expected.importers[path]
  if (JSON.stringify(yaml.load(derivedLock)) !== JSON.stringify(expected)) throw new Error('Distribution transform changed unrelated lock content')
  const source = {
    commit: readFileSync(join(product, 'DSH_PIN'), 'utf8').trim(),
    workspaceSha256: sha(workspaceText), lockSha256: sha(lockText), manifests,
    buildReceiptSha256: hashFile(join(dsh, 'DSH-BUILD-RECEIPT.json')),
  }
  if (source.commit !== distributionPolicy.sourceCommit) throw new Error('Distribution policy does not match DSH source pin')
  return { workspace: derivedWorkspace, lock: derivedLock, receipt: {
    schema: 'agent-pi-dsh/selected-production/v1', policy: distributionPolicy.id,
    policySha256: hashFile(policyFile), transformSha256: hashFile(fileURLToPath(import.meta.url)), source,
    derived: { workspaceSha256: sha(derivedWorkspace), lockSha256: sha(derivedLock) },
  } }
}

export function prepareDistributionWorkspace(dshRoot, product, destination) {
  const dsh = realpathSync(dshRoot), dest = resolve(destination)
  if (inside(dsh, dest) || inside(dest, dsh) || existsSync(dest)) throw new Error('Distribution install workspace must be a new directory outside DSH')
  const inputs = deriveDistributionInputs(dsh, product)
  cpSync(dsh, dest, { recursive: true, verbatimSymlinks: true, filter: path =>
    !relative(dsh, path).split(sep).some(part => part === 'node_modules' || part === '.git') &&
    !['.agent-pi-links.json', inputReceipt].includes(relative(dsh, path)) })
  writeFileSync(join(dest, 'pnpm-workspace.yaml'), inputs.workspace)
  writeFileSync(join(dest, 'pnpm-lock.yaml'), inputs.lock)
  writeJson(join(dest, inputReceipt), inputs.receipt)
  return inputs.receipt
}

function walk(root, visit) {
  const stack = [root]
  while (stack.length) {
    const directory = stack.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      visit(path, entry)
      if (entry.isDirectory() && !entry.isSymbolicLink()) stack.push(path)
    }
  }
}

export function projectDistributionModules(installRoot, dshRoot) {
  const source = realpathSync(installRoot), target = realpathSync(dshRoot)
  if (inside(source, target) || inside(target, source)) throw new Error('Install workspace and runtime must be separate')
  const receipt = readJson(join(source, inputReceipt))
  if (hashFile(join(source, 'pnpm-lock.yaml')) !== receipt.derived.lockSha256 || hashFile(join(source, 'pnpm-workspace.yaml')) !== receipt.derived.workspaceSha256) throw new Error('Frozen distribution install inputs changed')
  const modules = [], links = []
  walk(source, (path, entry) => {
    if (entry.isDirectory() && entry.name === 'node_modules' && !relative(source, dirname(path)).split(sep).includes('node_modules')) modules.push(path)
    if (!entry.isSymbolicLink() || !relative(source, path).split(sep).includes('node_modules')) return
    const to = resolve(dirname(path), readlinkSync(path))
    if (!inside(source, to)) throw new Error(`Distribution dependency link escapes install workspace: ${path}`)
    links.push({ from: slash(relative(source, path)), to: slash(relative(dirname(path), to)) })
  })
  if (!modules.some(path => path === join(source, 'node_modules'))) throw new Error('Distribution dependencies have not been installed')
  for (const path of modules) {
    const dest = join(target, relative(source, path))
    if (existsSync(dest)) throw new Error(`Refusing to merge stale runtime dependencies: ${dest}`)
    cpSync(path, dest, { recursive: true, verbatimSymlinks: true })
  }
  writeJson(join(target, '.agent-pi-links.json'), { version: 1, links })
  repairLinks(target)
  writeJson(join(target, distributionReceipt), receipt)
  return { moduleDirectories: modules.length, links: links.length }
}

export function installedPackageInventory(root) {
  const packages = []
  if (!existsSync(root)) return packages
  walk(root, (path, entry) => {
    if (entry.name !== 'package.json' || !entry.isFile()) return
    const parent = dirname(path), base = dirname(parent)
    // Only actual package roots, not package.json fixtures shipped inside deps.
    if (base.split(sep).at(-1) !== 'node_modules' && !(base.split(sep).at(-1).startsWith('@') && dirname(base).split(sep).at(-1) === 'node_modules')) return
    const manifest = readJson(path)
    if (excludedRuntimePackage(manifest.name || '')) throw new Error(`Excluded executable/SDK remains in runtime: ${path}`)
    packages.push({ path: slash(relative(root, parent)), name: manifest.name, version: manifest.version, sha256: hashFile(path) })
  })
  return packages.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

export function verifyDistributionRuntime(dsh, product, { seal = false } = {}) {
  const receiptPath = join(dsh, distributionReceipt), receipt = readJson(receiptPath)
  const expected = deriveDistributionInputs(dsh, product).receipt
  for (const key of ['schema', 'policy', 'policySha256', 'transformSha256', 'source', 'derived']) {
    if (JSON.stringify(receipt[key]) !== JSON.stringify(expected[key])) throw new Error(`Distribution receipt mismatch: ${key}`)
  }
  for (const path of Object.keys(distributionPolicy.excludedWorkspaces)) if (existsSync(join(dsh, path, 'node_modules'))) throw new Error(`Excluded provider has installed runtime dependencies: ${path}`)
  for (const path of distributionPolicy.requiredWorkspaces) {
    if (!existsSync(join(dsh, path, 'lib/index.js'))) throw new Error(`Compiled official OAR runtime missing: ${path}`)
  }
  const inventory = { dsh: installedPackageInventory(dsh), product: installedPackageInventory(product) }
  if (seal) {
    receipt.installedPackages = inventory
    writeJson(receiptPath, receipt)
  } else if (JSON.stringify(receipt.installedPackages) !== JSON.stringify(inventory)) throw new Error('Selected production package inventory differs from sealed runtime')
  return { policy: receipt.policy, packages: inventory.dsh.length + inventory.product.length }
}

/** Inspect the official final dump as data, including safe !!js expression nodes. */
export async function verifySelectedProfileFile(dsh, product, file) {
  if (!isSelectedMainline(product)) return { policy: 'legacy-distribution' }
  let entries
  try {
    const include = join(dsh, 'vendor/include')
    const { parseEntryYaml } = await import(pathToFileURL(join(include, 'lib/index.js')).href)
    entries = parseEntryYaml(readFileSync(file, 'utf8'))
  } catch { throw new Error('Selected production profile dump could not be parsed safely') }
  return verifySelectedProfile(entries)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, dsh, product, destination] = process.argv.slice(2)
  if (mode === 'prepare' && destination) {
    const receipt = prepareDistributionWorkspace(dsh, product, destination)
    console.log(JSON.stringify({ policy: receipt.policy, sourceCommit: receipt.source.commit, derived: receipt.derived }))
  }
  else if (mode === 'install' && destination) {
    prepareDistributionWorkspace(dsh, product, destination)
    const result = spawnSync('pnpm', ['install', '--prod', '--frozen-lockfile', '--ignore-scripts'], { cwd: resolve(destination), stdio: 'inherit' })
    if (result.error || result.status !== 0) throw new Error(`Selected production pnpm install failed: ${result.error?.message || result.status}`)
    console.log(JSON.stringify(projectDistributionModules(destination, dsh)))
  }
  else if (mode === 'project' && product) console.log(JSON.stringify(projectDistributionModules(dsh, product)))
  else if (['seal', 'verify'].includes(mode) && product) console.log(JSON.stringify(verifyDistributionRuntime(dsh, product, { seal: mode === 'seal' })))
  else if (mode === 'profile' && destination) console.log(JSON.stringify(await verifySelectedProfileFile(dsh, product, destination)))
  else if (mode === 'metadata' && destination) console.log(JSON.stringify(stageDistributionManifests(dsh, product, destination)))
  else throw new Error('Usage: dsh-distribution-policy.mjs prepare|install <dsh> <product> <new-install-dir> | project <install-dir> <dsh> | seal|verify <dsh> <product> | profile <dsh> <product> <dump-yaml> | metadata <runtime-dsh> <product> <clean-source-dsh>')
}
