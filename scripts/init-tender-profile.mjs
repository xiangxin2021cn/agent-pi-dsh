import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { repairDeepSeekModelCapacities } from './deepseek-model-capacities.mjs'
import { removeProductParallelCap } from './heal-agent-loop-settings.mjs'
import { installUniverRuntimeDeps } from './install-univer-runtime-deps.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dsh = process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness')
const home = process.env.DSH_HOME || join(root, '.dsh-home')
const profileDir = join(home, 'profiles/tender')
const manifestPath = join(profileDir, 'package.json')
const injectorDir = join(root, 'vendor/dsh-super-injector')
const routerPresetSrc = join(root, 'vendor/dsh-router-standard/preset')
const routerPresetDest = join(home, '.agent-presets/router-standard')

const INJECTOR_NAME = '@dsh-external/dsh-super-injector'
const GENUI_NAME = '@omdsh-dev/dsh-genui'
const ANYSEARCH_NAME = '@anysearch/anysearch-dsh'
const UNIVER_NAME = 'dsh-univer-office'
const WEB_FETCH_HTTP = '@deepseek-ai/dsh-web-fetch-http'
const CODEX_SUBAGENT = '@deepseek-ai/dsh-subagent-codex'
const bundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  CODEX_SUBAGENT,
  INJECTOR_NAME,
  'dsh-tender-host',
  'dsh-tender-web',
  'dshmarket',
  ANYSEARCH_NAME,
]

function findDshPackage(names) {
  const bases = [
    join(dsh, 'apps/cli/node_modules'),
    join(dsh, 'node_modules'),
    join(dsh, 'packages/core/tools/node_modules'),
    join(dsh, 'vendor'),
  ]
  for (const name of names) {
    const extraByName = {
      '@deepseek-ai/schemastery': [join(dsh, 'vendor/schemastery')],
      schemastery: [join(dsh, 'vendor/schemastery')],
      '@deepseek-ai/dsh-credentials': [join(dsh, 'packages/credentials/credentials')],
      '@deepseek-ai/dsh-web': [join(dsh, 'packages/web/web')],
      '@deepseek-ai/dsh-attachment': [join(dsh, 'packages/attachment/attachment')],
      '@deepseek-ai/dsh-host-webserver': [join(dsh, 'packages/host/webserver')],
      '@deepseek-ai/dsh-session': [join(dsh, 'packages/core/session')],
      '@deepseek-ai/dsh-skill': [join(dsh, 'packages/skill/skill')],
    }
    const extra = extraByName[name] ?? []
    const candidates = [
      ...bases.map((base) => join(base, name)),
      ...extra,
    ]
    for (const candidate of candidates) {
      if (existsSync(join(candidate, 'package.json'))) {
        try {
          return realpathSync(candidate)
        } catch {
          return candidate
        }
      }
    }
  }
  return null
}

function wireInjectorRuntimeDeps(targetDir) {
  const deps = {
    '@deepseek-ai/dsh-tools': ['@deepseek-ai/dsh-tools'],
    '@deepseek-ai/dsh-llm': ['@deepseek-ai/dsh-llm'],
    schemastery: ['schemastery', '@deepseek-ai/schemastery'],
    cordis: ['cordis', '@deepseek-ai/cordis'],
  }
  for (const [destName, names] of Object.entries(deps)) {
    const source = findDshPackage(names)
    if (!source) {
      throw new Error(`injector cannot resolve ${destName} under ${dsh}`)
    }
    ensureJunction(source, join(targetDir, 'node_modules', destName))
  }
}

function embedInjectorInDshCli() {
  if (!existsSync(join(injectorDir, 'lib/index.js'))) {
    throw new Error(`injector missing at ${injectorDir}`)
  }
  const dest = join(dsh, 'apps/cli/node_modules/@dsh-external/dsh-super-injector')
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  cpSync(injectorDir, dest, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const normalized = src.replace(/\\/g, '/').toLowerCase()
      return !normalized.includes('/node_modules/') && !normalized.endsWith('.map')
    },
  })
  wireInjectorRuntimeDeps(dest)
  return dest
}

const embeddedInjector = embedInjectorInDshCli()

const localPlugins = [
  { name: 'dsh-tender-host', dir: join(root, 'bundles/tender-host') },
  { name: 'dsh-tender-web', dir: join(root, 'bundles/tender-web') },
  { name: CODEX_SUBAGENT, dir: join(dsh, 'packages/subagent/subagent-codex') },
  { name: INJECTOR_NAME, dir: embeddedInjector },
  // Vendored npm tarball of the community plugin market (offline preinstall;
  // the market updates itself through its own update channel afterwards).
  { name: 'dshmarket', dir: join(root, 'vendor/dshmarket'), updatable: true },
  // Vendored AnySearch: already-built lib/. Official docs say --profile web;
  // this product must use tender. Do not run prepare (it is tsc).
  { name: ANYSEARCH_NAME, dir: join(root, 'vendor/anysearch-dsh'), updatable: true },
]

const univerDir = join(root, 'vendor/dsh-univer-office')
const univerReady = existsSync(join(univerDir, 'lib/index.js'))
if (univerReady) {
  bundles.push(UNIVER_NAME)
  localPlugins.push({ name: UNIVER_NAME, dir: univerDir, updatable: true })
}

mkdirSync(profileDir, { recursive: true })

let dependencies = {}
if (existsSync(manifestPath)) {
  try {
    dependencies = JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies ?? {}
  } catch {
    dependencies = {}
  }
}

function packageDeclaresBundle(packageName) {
  try {
    const manifest = JSON.parse(readFileSync(join(moduleDest(packageName), 'package.json'), 'utf8'))
    return manifest.dsh?.bundle !== undefined
  } catch {
    return false
  }
}

function readExistingBundles() {
  try {
    const listed = JSON.parse(readFileSync(manifestPath, 'utf8')).dsh?.profile?.bundles
    return Array.isArray(listed) ? listed.filter((name) => typeof name === 'string') : []
  } catch {
    return []
  }
}

/** Conversation / injector installs must survive the next boot. */
/** J-Space shipped as a bundled skill, not a market plugin. It hijacked the
 *  skill catalog and must not come back from a leftover conversation install. */
function isRetiredJSpaceName(name) {
  const n = String(name || '').toLowerCase()
  return n === 'j-space' || n === 'jspace' || n === 'dsh-jspace'
    || n.endsWith('/j-space') || n.endsWith('/jspace') || n.endsWith('/j-space-dsh')
}

/** Official DeepSeek-V4-Flash-Vision-Exp replaces the third-party vision plugin. */
function isRetiredVisionRouterName(name) {
  const n = String(name || '').toLowerCase()
  return n === 'dsh-vision-router' || n.endsWith('/dsh-vision-router')
}

function isRetiredPluginName(name) {
  return isRetiredJSpaceName(name) || isRetiredVisionRouterName(name)
}

function composeBundles(deps) {
  const hidden = new Set([WEB_FETCH_HTTP])
  const extras = []
  const add = (name) => {
    if (!name || hidden.has(name) || isRetiredPluginName(name) || bundles.includes(name) || extras.includes(name)) return
    extras.push(name)
  }
  for (const name of Object.keys(deps)) {
    if (!hidden.has(name) && packageDeclaresBundle(name)) add(name)
  }
  for (const name of readExistingBundles()) {
    if (deps[name] && packageDeclaresBundle(name)) add(name)
  }
  return [...bundles, ...extras]
}

function writeManifest(deps) {
  delete deps[WEB_FETCH_HTTP]
  for (const name of Object.keys(deps)) {
    if (isRetiredPluginName(name)) delete deps[name]
  }
  writeFileSync(manifestPath, `${JSON.stringify({
    name: 'dsh-profile-tender',
    private: true,
    dependencies: deps,
    dsh: { profile: { bundles: composeBundles(deps) } },
  }, null, 2)}\n`)
}

writeManifest(dependencies)

const workspacePath = join(profileDir, 'pnpm-workspace.yaml')
if (!existsSync(workspacePath)) {
  writeFileSync(workspacePath, 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
}
// Profile overlay defaults. The marker line keeps the file under this
// script's management: it is rewritten on every start while the marker is
// present (or while the file is still an empty template), so shipped
// defaults can evolve. Users who want a custom overlay delete the marker.
const PATCH_MANAGED_MARK = '# agent-pi:managed-defaults'
const patchPath = join(profileDir, 'cordis.patch.yml')
function patchIsEmptyTemplate(text) {
  const body = text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .join('\n')
    .trim()
  return body === '' || body === '[]'
}
function buildManagedPatch(deps) {
  const searchProvider = composeBundles(deps).includes('@anysearch/anysearch-dsh')
    ? 'anysearch'
    : 'deepseek-official'
  const compactionFallback = process.env.AGENT_PI_COMPACTION_FALLBACK === '0'
    ? ''
    : `    summarizationFallbacks:
      - provider: deepseek-official
        model: deepseek-v4-flash-vision-exp
        maxTokens: 32768
`
  return `${PATCH_MANAGED_MARK}
# Profile overlay (applied after every bundle layer). Auto-rewritten on app
# start while the marker line above is present; delete it to customize.

# Official catalog: Flash / Pro stay text-only; Flash Vision Exp understands
# images natively via Files API (rc.2) with inline fallback. Do not load
# dsh-vision-router — a leftover stealth hijack would hide llm-deepseek.
# This product defaults new sessions to the vision model; stock dsh-base
# still ships Flash.
- id: llm-deepseek
  config:
    models:
      - id: deepseek-v4-flash-vision-exp
        name: DeepSeek-V4-Flash-Vision-Exp
        contextWindow: 1000000
        maxTokens: 384000
        inputModalities: [text, image]
      - id: deepseek-v4-flash
        name: DeepSeek-V4-Flash
        contextWindow: 1000000
        maxTokens: 384000
      - id: deepseek-v4-pro
        name: DeepSeek-V4-Pro
        contextWindow: 1000000
        maxTokens: 384000
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-v4-flash-vision-exp

# Compact near 72% with the current session model first. When enabled, the
# DeepSeek vision model is only an eligible-failure summary fallback.
- id: compaction-basic
  config:
    thresholdRatio: 0.72
${compactionFallback}
# Codex is an isolated product subagent, not a replacement LLM provider.
# Auto-review remains confined to Codex's native workspace-write sandbox.
- id: subagent-codex
  config:
    permissionMode: approve-for-me

# Parallelism stays on the DSH native agent-loop rolling pool (omit
# maxParallelToolCalls → default 10). Do not stamp a product cap here.
# Electron owns the window. rc.8 web-runtime defaults openBrowser: true.
- id: web-runtime
  config:
    openBrowser: false

# Desktop workbench: turn web_fetch back on. Stock DSH ships search-only.
# Do not list web-fetch-http in package.json — it has no dsh.bundle, and the
# market would show a false "verification failed". Overlay insert loads it.
# searchProvider is anysearch when the vendored (or later-installed) bundle is present.
- insert:
    - id: web-fetch-http
      name: '@deepseek-ai/dsh-web-fetch-http'
- id: web
  config:
    searchProvider: ${searchProvider}
    fetchProvider: http
- id: tool-web
  config:
    fetch: true
    searchTimeoutMs: 60000
`
}
function writeManagedPatch(deps) {
  let currentPatch = null
  try {
    currentPatch = readFileSync(patchPath, 'utf8')
  } catch {
    // Missing overlay: treat as managed.
  }
  const patchManaged = currentPatch === null
    || currentPatch.includes(PATCH_MANAGED_MARK)
    || patchIsEmptyTemplate(currentPatch)
  const next = buildManagedPatch(deps)
  if (patchManaged && currentPatch !== next) {
    writeFileSync(patchPath, next)
  }
  if (patchManaged) retireVisionRouterResidue()
}

function repairExistingDeepSeekModelCapacities() {
  const settingsPath = join(home, 'settings.yaml')
  if (!existsSync(settingsPath)) return
  const current = readFileSync(settingsPath, 'utf8')
  const repaired = repairDeepSeekModelCapacities(current)
  if (repaired.changed) writeFileSync(settingsPath, repaired.yaml)
}

const OFFICIAL_VISION_MODEL = `    - id: deepseek-v4-flash-vision-exp
      name: DeepSeek-V4-Flash-Vision-Exp
      inputModalities:
        - text
        - image
`

/** Drop leftover vision-router settings and keep the official vision model listed. */
function retireVisionRouterResidue() {
  const settingsPath = join(home, 'settings.yaml')
  if (!existsSync(settingsPath)) return
  let text = readFileSync(settingsPath, 'utf8')
  const next = text.replace(/(?:^|\n)vision-router:\s*\n(?:[ \t].*\n)*/g, '\n')
  const withCatalog = ensureOfficialVisionCatalog(next)
  const withDefault = ensureDefaultVisionModel(withCatalog)
  const healed = removeProductParallelCap(withDefault)
  if (healed !== text) writeFileSync(settingsPath, healed)
}

const DEFAULT_VISION_SETTINGS = `agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-flash-vision-exp
`

/** Factory default is Vision Exp. Only rewrite a missing or old Flash default. */
function ensureDefaultVisionModel(text) {
  if (!/(?:^|\n)agent-default-model:\s*\n/.test(text)) {
    return `${DEFAULT_VISION_SETTINGS}${text.replace(/^\uFEFF?/, '')}`
  }
  return text.replace(
    /((?:^|\n)agent-default-model:\s*\n(?:[ \t].*\n)*?[ \t]+model:\s*)deepseek-v4-flash(?:[ \t]*\r?\n)/,
    '$1deepseek-v4-flash-vision-exp\n',
  )
}

function visionExpDeclaresImage(entry) {
  return /inputModalities:\s*\[[^\]]*\bimage\b/.test(entry)
    || /\n[ \t]+-\s+image\b/.test(entry)
}

function repairOfficialVisionModalities(text) {
  const match = text.match(/([ \t]+)- id: deepseek-v4-flash-vision-exp\r?\n(?:[ \t]+.+\r?\n)*/ )
  if (!match) return text
  if (visionExpDeclaresImage(match[0])) return text
  return text.replace(match[0], OFFICIAL_VISION_MODEL.endsWith('\n')
    ? OFFICIAL_VISION_MODEL
    : `${OFFICIAL_VISION_MODEL}\n`)
}

function ensureOfficialVisionCatalog(text) {
  if (text.includes('deepseek-v4-flash-vision-exp')) return repairOfficialVisionModalities(text)
  const match = text.match(/(?:^|\n)(llm-deepseek:\s*\n(?:[ \t].*\n)*)/)
  if (!match) return text
  const block = match[1]
  if (!/\n[ \t]+models:\s*\n/.test(block)) return text
  const updated = `${block.replace(/\s*$/, '\n')}${OFFICIAL_VISION_MODEL}`
  return text.replace(block, updated)
}

function hasCommand(name) {
  const result = spawnSync(name, ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  return result.status === 0
}

function runDsh(args) {
  const bin = join(dsh, 'apps/cli/lib/bin.js')
  const src = join(dsh, 'apps/cli/src/bin.ts')
  const nodeArgs = existsSync(bin)
    ? [bin, ...args]
    : ['--import', 'tsx/esm', src, ...args]
  return spawnSync(process.execPath, nodeArgs, {
    cwd: dsh,
    env: { ...process.env, DSH_HOME: home, DSH_CHECKOUT: dsh },
    stdio: 'inherit',
    windowsHide: true,
  })
}

function moduleDest(packageName) {
  return join(profileDir, 'node_modules', ...packageName.split('/'))
}

function samePath(a, b) {
  try {
    return realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase()
  } catch {
    return false
  }
}

function ensureJunction(sourceDir, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  try {
    const stat = lstatSync(dest)
    if ((stat.isSymbolicLink() || stat.isDirectory()) && samePath(sourceDir, dest)) return
    rmSync(dest, { recursive: !stat.isSymbolicLink(), force: true })
  } catch {
    // dest does not exist
  }
  try {
    symlinkSync(sourceDir, dest, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      try { rmSync(dest, { recursive: true, force: true }) } catch {}
      symlinkSync(sourceDir, dest, process.platform === 'win32' ? 'junction' : 'dir')
      return
    }
    throw error
  }
}

function wireCodexRuntimeDeps() {
  const sourceStore = join(dsh, 'node_modules', '.pnpm')
  const targetStore = join(profileDir, 'node_modules', '.pnpm')
  const entries = readdirSync(sourceStore, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('@openai+codex@'))
  if (entries.length === 0) {
    throw new Error(`Codex runtime packages missing under ${sourceStore}`)
  }
  for (const entry of entries) {
    ensureJunction(join(sourceStore, entry.name), join(targetStore, entry.name))
  }
}

function linkLocalBundle(packageName, sourceDir) {
  if (!existsSync(join(sourceDir, 'package.json'))) {
    throw new Error(`missing plugin package at ${sourceDir}`)
  }
  ensureJunction(sourceDir, moduleDest(packageName))
  dependencies[packageName] = `link:${sourceDir.replace(/\\/g, '/')}`
}

function alreadyLinked(packageName, sourceDir) {
  const dest = moduleDest(packageName)
  return existsSync(join(sourceDir, 'package.json')) && existsSync(dest) && samePath(sourceDir, dest)
}

function dshPluginAdd(spec) {
  const result = runDsh(['plugin', '--profile', 'tender', 'add', spec])
  if (result.status !== 0) throw new Error(`dsh plugin add failed for ${spec}`)
}

function packageVersion(dir) {
  try {
    const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

function compareVersions(a, b) {
  const parse = (value) => String(value).split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0)
  const [aParts, bParts] = [parse(a), parse(b)]
  for (let index = 0; index < 3; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// The in-app updater (plugin settings card / market) replaces the preinstall
// junction with a real registry install and rewrites the dependency spec.
// Keep that install when it is at least as new as the vendored copy; an app
// upgrade shipping a newer vendored copy falls through and re-links.
function keepsRegistryInstall(plugin) {
  if (!plugin.updatable) return false
  const dest = moduleDest(plugin.name)
  try {
    if (lstatSync(dest).isSymbolicLink()) return false
  } catch {
    return false
  }
  if (samePath(dest, plugin.dir)) return false
  const installed = packageVersion(dest)
  const vendored = packageVersion(plugin.dir)
  if (!installed || !vendored) return false
  return compareVersions(installed, vendored) >= 0
}

const preferOfficialAdd = process.env.AGENT_PI_OFFICIAL_PLUGIN_ADD === '1' && hasCommand('pnpm')
for (const plugin of localPlugins) {
  if (keepsRegistryInstall(plugin)) {
    dependencies[plugin.name] ||= `^${packageVersion(moduleDest(plugin.name))}`
    continue
  }
  if (alreadyLinked(plugin.name, plugin.dir)) {
    dependencies[plugin.name] = `link:${plugin.dir.replace(/\\/g, '/')}`
    continue
  }
  if (preferOfficialAdd) {
    try {
      dshPluginAdd(plugin.dir)
      continue
    } catch (error) {
      process.stderr.write(`official plugin add failed for ${plugin.name}, falling back to junction: ${error}\n`)
    }
  }
  linkLocalBundle(plugin.name, plugin.dir)
}

wireCodexRuntimeDeps()

writeManifest(dependencies)

function wireDesktopWebFetch() {
  const src = join(dsh, 'packages/web/web-fetch-http')
  if (!existsSync(join(src, 'package.json'))) {
    throw new Error(`web-fetch-http missing under ${src}`)
  }
  if (!existsSync(join(src, 'lib/index.js'))) {
    throw new Error(`web-fetch-http has no built lib/ at ${src}`)
  }
  ensureJunction(src, moduleDest(WEB_FETCH_HTTP))
}
wireDesktopWebFetch()

function wireAnysearchPeers() {
  const vendoredDir = join(root, 'vendor/anysearch-dsh')
  let pluginDir = vendoredDir
  try {
    pluginDir = realpathSync(moduleDest(ANYSEARCH_NAME))
  } catch {
    // Profile not linked yet.
  }
  if (!existsSync(join(pluginDir, 'package.json'))) return
  const peers = [
    ['@deepseek-ai/cordis', ['@deepseek-ai/cordis', 'cordis']],
    ['@deepseek-ai/dsh-credentials', ['@deepseek-ai/dsh-credentials']],
    ['@deepseek-ai/dsh-tools', ['@deepseek-ai/dsh-tools']],
    ['@deepseek-ai/dsh-web', ['@deepseek-ai/dsh-web']],
    ['@deepseek-ai/schemastery', ['@deepseek-ai/schemastery', 'schemastery']],
  ]
  for (const [destName, names] of peers) {
    const source = findDshPackage(names)
    if (!source) {
      throw new Error(`anysearch cannot resolve ${destName} under ${dsh}`)
    }
    ensureJunction(source, join(pluginDir, 'node_modules', ...destName.split('/')))
  }
}
wireAnysearchPeers()

function ensureUniverRuntimeDeps() {
  if (!univerReady) return
  if (process.env.AGENT_PI_SKIP_UNIVER_INSTALL === '1') return
  installUniverRuntimeDeps(univerDir, join(home, '.runtime-install', UNIVER_NAME))
}

function wireUniverPeers() {
  if (!univerReady) return
  let pluginDir = univerDir
  try {
    pluginDir = realpathSync(moduleDest(UNIVER_NAME))
  } catch {
    // Profile not linked yet.
  }
  if (!existsSync(join(pluginDir, 'package.json'))) return
  const peers = [
    ['@deepseek-ai/cordis', ['@deepseek-ai/cordis', 'cordis']],
    ['@deepseek-ai/dsh-attachment', ['@deepseek-ai/dsh-attachment']],
    ['@deepseek-ai/dsh-host-webserver', ['@deepseek-ai/dsh-host-webserver']],
    ['@deepseek-ai/dsh-llm', ['@deepseek-ai/dsh-llm']],
    ['@deepseek-ai/dsh-session', ['@deepseek-ai/dsh-session']],
    ['@deepseek-ai/dsh-skill', ['@deepseek-ai/dsh-skill']],
    ['@deepseek-ai/dsh-tools', ['@deepseek-ai/dsh-tools']],
    ['@deepseek-ai/schemastery', ['@deepseek-ai/schemastery', 'schemastery']],
  ]
  for (const [destName, names] of peers) {
    const source = findDshPackage(names)
    if (!source) {
      process.stderr.write(`univer cannot resolve ${destName} under ${dsh}\n`)
      continue
    }
    ensureJunction(source, join(pluginDir, 'node_modules', ...destName.split('/')))
  }
}

function syncUniverSkills() {
  const srcRoot = [
    join(moduleDest(UNIVER_NAME), 'skills'),
    join(univerDir, 'skills'),
  ].find((path) => existsSync(path))
  if (!srcRoot) return
  let names = []
  try {
    names = readdirSync(srcRoot)
  } catch {
    return
  }
  for (const name of names) {
    const src = join(srcRoot, name, 'SKILL.md')
    if (!existsSync(src)) continue
    const dest = join(home, 'skills', name, 'SKILL.md')
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }
}

ensureUniverRuntimeDeps()
wireUniverPeers()
writeManifest(dependencies)
writeManagedPatch(dependencies)

function enableDesktopWebFetch() {
  const helper = join(root, 'scripts/enable-desktop-web-fetch.mjs')
  if (!existsSync(helper)) return
  const files = [
    join(dsh, 'apps/cli/config/agent-presets/standard/agent.cordis.yml'),
    join(dsh, 'apps/cli/config/agent-presets/code/agent.cordis.yml'),
    join(dsh, 'apps/cli/config/agent-presets/cordis/agent.cordis.yml'),
    join(routerPresetSrc, 'agent.cordis.yml'),
    join(routerPresetDest, 'agent.cordis.yml'),
  ].filter((file) => existsSync(file))
  if (files.length === 0) return
  const result = spawnSync(process.execPath, [helper, ...files], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.status !== 0) {
    process.stderr.write(`desktop web_fetch overlay skipped (presets not writable): ${result.stderr || result.status}\n`)
  }
}

function enableDesktopCodex() {
  const helper = join(root, 'scripts/enable-desktop-codex.mjs')
  if (!existsSync(helper)) return
  const files = [
    join(dsh, 'apps/cli/config/agent-presets/standard/agent.cordis.yml'),
    join(dsh, 'apps/cli/config/agent-presets/code/agent.cordis.yml'),
    join(dsh, 'apps/cli/config/agent-presets/cordis/agent.cordis.yml'),
    join(routerPresetSrc, 'agent.cordis.yml'),
    join(routerPresetDest, 'agent.cordis.yml'),
  ].filter((file) => existsSync(file))
  if (files.length === 0) return
  const result = spawnSync(process.execPath, [helper, ...files], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.status !== 0) {
    process.stderr.write(`desktop Codex overlay skipped: ${result.stderr || result.status}\n`)
  }
}

function installRouterPreset() {
  const required = ['agent.cordis.yml', 'preset.yml', 'router-bootstrap.mjs', 'router-core.mjs']
  for (const name of required) {
    if (!existsSync(join(routerPresetSrc, name))) {
      throw new Error(`router-standard preset missing ${name} under ${routerPresetSrc}`)
    }
  }
  mkdirSync(routerPresetDest, { recursive: true })
  for (const name of required) {
    copyFileSync(join(routerPresetSrc, name), join(routerPresetDest, name))
  }
}

function removeRetiredJSpace() {
  const dirs = [
    join(root, 'skills', 'j-space'),
    join(home, 'skills', 'j-space'),
  ]
  if (process.env.AGENT_PI_SKILLS_ROOT) {
    dirs.push(join(process.env.AGENT_PI_SKILLS_ROOT, 'j-space'))
  }
  if (process.env.DSH_BUNDLED_SKILL_DIR) {
    dirs.push(join(process.env.DSH_BUNDLED_SKILL_DIR, 'j-space'))
  }
  for (const dir of dirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  for (const name of Object.keys(dependencies)) {
    if (!isRetiredJSpaceName(name)) continue
    delete dependencies[name]
    try {
      rmSync(moduleDest(name), { recursive: true, force: true })
    } catch {
      // Junction or missing dest: the manifest strip is enough.
    }
  }
}

function removeRetiredVisionRouter() {
  for (const name of Object.keys(dependencies)) {
    if (!isRetiredVisionRouterName(name)) continue
    delete dependencies[name]
    try {
      rmSync(moduleDest(name), { recursive: true, force: true })
    } catch {
      // Junction or missing dest: the manifest strip is enough.
    }
  }
  retireVisionRouterResidue()
}

function dropFactoryGenuiSkill() {
  if (dependencies[GENUI_NAME]) return
  const dest = join(home, 'skills/genui')
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
}

installRouterPreset()
enableDesktopWebFetch()
enableDesktopCodex()
removeRetiredJSpace()
removeRetiredVisionRouter()
dropFactoryGenuiSkill()
syncUniverSkills()
writeManifest(dependencies)
writeManagedPatch(dependencies)
repairExistingDeepSeekModelCapacities()

process.stdout.write(`tender profile ready at ${profileDir}\n`)
process.stdout.write(`router-standard preset at ${routerPresetDest}\n`)
process.stdout.write(readFileSync(manifestPath, 'utf8'))
