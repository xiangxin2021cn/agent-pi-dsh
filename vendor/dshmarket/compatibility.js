import { chmodSync, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DSH_IM_PACKAGE = '@xmanrui/dsh-im'
export const DSH_EMAIL_PACKAGE = 'dsh-email'
export const CLAUDE_CODE_PACKAGE = '@deepseek-ai/dsh-subagent-claude-code'
export const VOICE_INPUT_PACKAGE = '@deepseek-ai/dsh-experimental-voice-input-bundle'
export const NATIVE_CUA_PACKAGE = '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
export const MACOS_CUA_PACKAGE = '@deepseek-ai/dsh-experimental-cua-macos'

function isIntelCompatibilityDistribution() {
  const productRoot = process.env.DSH_BUNDLED_SKILL_DIR ? dirname(process.env.DSH_BUNDLED_SKILL_DIR)
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  return existsSync(join(productRoot, 'MACOS-INTEL-MONTEREY.json'))
}

export const TEAM_COMPONENTS = ['agent-team', 'tool-agent-team', 'agent-team-profile', 'agent-team-web-profile', 'client-ui-agent-team']
  .map(name => `@deepseek-ai/dsh-experimental-${name}`)
export const TEAM_MANAGED_REASON = 'Agent Teams 内置组件，由设置 → DSH 运行设置 → Agent Teams 统一开启或关闭，保存后重启；请勿单独安装、启停或卸载 / built-in Agent Teams component; use Settings → DSH runtime settings → Agent Teams and restart; do not manage components individually'

const BUNDLED_REGISTRY_SOURCES = new Map([
  ['dshmarket', 'vendor/dshmarket'],
  ['dsh-univer-office', 'vendor/dsh-univer-office'],
  ['@anysearch/anysearch-dsh', 'vendor/anysearch-dsh'],
])

/** Only the product's exact bundled trees may leave a link for an online release. */
export function agentPiBundledRegistrySource(profileDirectory, name, spec) {
  if (!String(spec).startsWith('link:') || !BUNDLED_REGISTRY_SOURCES.has(name)) return null
  try {
    const productRoot = process.env.DSH_BUNDLED_SKILL_DIR ? dirname(process.env.DSH_BUNDLED_SKILL_DIR)
      : resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const product = JSON.parse(readFileSync(join(productRoot, 'package.json'), 'utf8'))
    if (!['mainline', 'tender'].includes(product.agentPiProduct?.edition)) return null
    const expected = realpathSync(join(productRoot, BUNDLED_REGISTRY_SOURCES.get(name)))
    const same = value => process.platform === 'win32' ? value.toLowerCase() : value
    if (same(realpathSync(resolve(profileDirectory, spec.slice(5)))) !== same(expected)
      || same(realpathSync(join(profileDirectory, 'node_modules', name))) !== same(expected)) return null
    if (JSON.parse(readFileSync(join(expected, 'package.json'), 'utf8')).name !== name) return null
    return name
  } catch { return null }
}

export function agentPiBundledSourceFingerprint(profileDirectory, name, spec) {
  if (agentPiBundledRegistrySource(profileDirectory, name, spec) !== name) return null
  try {
    const root = realpathSync(join(profileDirectory, 'node_modules', name)), hash = createHash('sha256')
    const visit = (directory, prefix = '') => {
      for (const entry of readdirSync(directory).sort()) {
        if (entry === 'node_modules' || entry === '.git') continue
        const file = join(directory, entry), key = prefix + entry, stat = lstatSync(file)
        if (stat.isSymbolicLink()) throw new Error('linked bundled source')
        if (stat.isDirectory()) visit(file, key + '/')
        else if (stat.isFile()) hash.update(key + '\0').update(readFileSync(file)).update('\0')
        else throw new Error('unsupported bundled source')
      }
    }
    visit(root)
    return hash.digest('hex')
  } catch { return null }
}

export function isTeamComponent(name) {
  return TEAM_COMPONENTS.includes(name)
}

const DIRECT_TYPERT_CHECK = /typeof\s+([A-Za-z_$][\w$]*)\?\.typertGateway\?\.stream\s*={2,3}\s*(["'])function\2/g
const CONTEXT_TYPERT_LOOKUP = /\.get(?:\?\.)?\(\s*["']typertGateway["']/

function result(status, reason, changed = false) {
  return Object.freeze({ status, reason, changed })
}

function packageInfo(profileDirectory, name) {
  const packageDirectory = join(profileDirectory, 'node_modules', name)
  try {
    const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))
    return { manifest, packageDirectory }
  } catch {
    return null
  }
}

function runtimePath(info) {
  const entry = typeof info.manifest.main === 'string' ? info.manifest.main : './lib/index.js'
  if (isAbsolute(entry)) return null
  const resolved = resolve(info.packageDirectory, entry)
  const escaped = relative(info.packageDirectory, resolved)
  if (escaped === '..' || escaped.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(escaped)) return null
  return resolved
}

function installedMajor(version) {
  const match = /^(\d+)\./.exec(String(version ?? ''))
  return match === null ? null : Number(match[1])
}

const REVIEWED_PLUGIN_FILES = {
  '@xmanrui/dsh-im@5.9.1': {
    'lib/index.js': 'bd8a1c9a5dbef0dfeecd71a503dd93e82409ffb13c4dcd2b64851e5882c90b33',
  },
  'dsh-email@0.21.2': {
    'lib/index.js': '03fd3336faf85ae3854dbf09d54923eaa823f61a23fe3c451fd651fab7f59cbe',
    'lib/runtime.js': '29ef488f42aefe0a871001da0ec94eb30cd5fe4bcf108bcbf61d76b6853ed574',
    'lib/tools.js': '100a5e756c7b8099ac801c51102a03fe7818cb3d167d76911125d634e2379d60',
    'lib/approval.js': '848526b3274bedb7d316989eabbff36a055cc16299650f095b6f9a7474475060',
    'lib/host-config.js': '4768ce411c6cd3468448366b1d801a9b58e5ce8db57951a799b9776d931337df',
  },
}

function reviewedPluginEntry(info, name) {
  const expected = info && REVIEWED_PLUGIN_FILES[`${name}@${info.manifest.version}`]
  if (!expected || info.manifest.name !== name) return false
  try {
    const productRoot = process.env.DSH_BUNDLED_SKILL_DIR ? dirname(process.env.DSH_BUNDLED_SKILL_DIR)
      : resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    if (readFileSync(join(productRoot, 'DSH_PIN'), 'utf8').trim() !== 'ce7073d51254c26cd63b22a60835b8f948deb447') return false
    if (runtimePath(info) !== resolve(info.packageDirectory, 'lib/index.js')) return false
    const root = realpathSync(info.packageDirectory)
    for (const [file, hash] of Object.entries(expected)) {
      const path = join(info.packageDirectory, file), relativePath = relative(root, realpathSync(path))
      if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith('..\\') || relativePath.startsWith('../')
        || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) return false
      if (createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) return false
    }
    return true
  } catch { return false }
}

function replaceFileBreakingHardLinks(path, content) {
  const temporary = `${path}.agent-pi-compat.tmp`
  const backup = `${path}.agent-pi-compat.bak`
  if (existsSync(backup) && !existsSync(path)) renameSync(backup, path)
  else if (existsSync(backup)) rmSync(backup, { force: true })
  rmSync(temporary, { force: true })
  writeFileSync(temporary, content, { flag: 'wx' })
  chmodSync(temporary, statSync(path).mode)
  renameSync(path, backup)
  try {
    renameSync(temporary, path)
    rmSync(backup, { force: true })
  } catch (error) {
    if (!existsSync(path) && existsSync(backup)) renameSync(backup, path)
    throw error
  } finally {
    rmSync(temporary, { force: true })
  }
}

/**
 * Read Agent Pi's known compatibility boundary without changing the package.
 * dsh-im 3.x requires the removed apiProxy service. dsh-im 4.x contains the
 * Typert path, but 4.0.0 probes a Cordis service through direct property
 * access; DSH 0.1.2-alpha.1 exposes it reliably through Context#get instead.
 */
export function inspectKnownPluginCompatibility(profileDirectory, name) {
  if ([VOICE_INPUT_PACKAGE, NATIVE_CUA_PACKAGE, MACOS_CUA_PACKAGE].includes(name) && isIntelCompatibilityDistribution()) {
    return result('incompatible', '此 Intel macOS 兼容分发不提供本地语音和原生桌面操作运行库，该组件不可启用；已安装插件和用户配置保留 / This Intel macOS compatibility distribution omits local speech and native desktop-control runtimes; this component cannot be enabled. Installed plugins and user settings are retained')
  }
  if (name === CLAUDE_CODE_PACKAGE && process.platform === 'darwin' && process.arch === 'x64') {
    if (Number.parseInt(os.release(), 10) < 22) {
      return result('incompatible', 'Claude Code 原生引擎要求 macOS 13 或更新系统；macOS 12 请使用 DSH/Codex。插件和用户配置保留 / Claude Code requires macOS 13 or later; use DSH/Codex on macOS 12. Plugin and user settings are retained')
    }
    const info = packageInfo(profileDirectory, name)
    try {
      const provider = createRequire(join(info.packageDirectory, 'package.json'))
      const sdk = createRequire(provider.resolve('@anthropic-ai/claude-agent-sdk'))
      const native = sdk.resolve('@anthropic-ai/claude-agent-sdk-darwin-x64/package.json')
      if (JSON.parse(readFileSync(native, 'utf8')).name === '@anthropic-ai/claude-agent-sdk-darwin-x64'
        && statSync(join(dirname(native), 'claude')).isFile()) {
        return result('irrelevant', 'Claude Code native engine is present')
      }
    } catch {}
    return result('incompatible', '当前 Intel macOS 兼容运行时未包含 Claude Code 原生引擎，请使用 DSH/Codex。插件和用户配置保留 / This Intel macOS compatibility runtime does not include the Claude Code native engine; use DSH/Codex. Plugin and user settings are retained')
  }
  if (name === DSH_EMAIL_PACKAGE) {
    const info = packageInfo(profileDirectory, name)
    if (info === null) return result('incompatible', '邮件插件包不完整 / email plugin package is incomplete')
    if (reviewedPluginEntry(info, name)) return result('compatible', '已核验此版本与当前 DSH 内核兼容 / this exact release has been verified with the current DSH runtime')
    for (const entry of ['lib/runtime.js', 'lib/index.js']) {
      const path = join(info.packageDirectory, entry)
      if (existsSync(path) && /ctx\.settings\.register\s*\(/.test(readFileSync(path, 'utf8'))) {
        return result('incompatible', `dsh-email ${info.manifest.version} 使用 DSH 0.1.7 已移除的 settings.register；保留插件和账号配置，等待兼容版本 / plugin uses removed settings.register; package and account configuration are retained`)
      }
    }
    return result('irrelevant', 'no removed email settings API detected; use the host compatibility check')
  }
  if (name !== DSH_IM_PACKAGE) return result('irrelevant', 'no product compatibility rule')
  const info = packageInfo(profileDirectory, name)
  if (info === null) {
    return result('incompatible', '插件包不完整，无法检查兼容性 / plugin package is incomplete; compatibility cannot be checked')
  }
  if (reviewedPluginEntry(info, name)) return result('compatible', '已核验此版本与当前 DSH 内核兼容 / this exact release has been verified with the current DSH runtime')
  const major = installedMajor(info.manifest.version)
  if (major === null || major < 4) {
    return result('incompatible', `不兼容：dsh-im ${String(info.manifest.version ?? 'unknown')} 依赖已移除的 apiProxy；需要 4.x / incompatible: dsh-im ${String(info.manifest.version ?? 'unknown')} depends on removed apiProxy; version 4.x is required`)
  }
  if (major > 4) {
    return result('incompatible', `尚未验证 dsh-im ${String(info.manifest.version)} 与当前 DSH 内核的兼容性 / dsh-im ${String(info.manifest.version)} has not been verified with this DSH runtime`)
  }
  const entry = runtimePath(info)
  if (entry === null) {
    return result('incompatible', 'dsh-im 主入口越出插件目录，拒绝兼容处理 / dsh-im main entry escapes its package directory; compatibility preparation refused')
  }
  let source
  try {
    source = readFileSync(entry, 'utf8')
  } catch {
    return result('incompatible', 'dsh-im 缺少可加载的主入口 / dsh-im has no loadable main entry')
  }
  if (CONTEXT_TYPERT_LOOKUP.test(source)) {
    return result('compatible', '已使用 Typert Gateway 新路径 / using the Typert Gateway path')
  }
  DIRECT_TYPERT_CHECK.lastIndex = 0
  if (DIRECT_TYPERT_CHECK.test(source)) {
    return result('repairable', '需要把 Typert Gateway 探测切换到 Context#get；重启前自动处理 / Typert Gateway detection must use Context#get; it will be prepared before restart')
  }
  return result('incompatible', '未找到可验证的 Typert Gateway 接入点 / no verifiable Typert Gateway integration point was found')
}

/** Prepare the installed v4 package before Cordis loads its bundle. */
export function prepareKnownPluginCompatibility(profileDirectory, name) {
  const inspected = inspectKnownPluginCompatibility(profileDirectory, name)
  if (inspected.status !== 'repairable') return inspected
  const info = packageInfo(profileDirectory, name)
  const entry = info === null ? null : runtimePath(info)
  if (entry === null) return result('incompatible', inspected.reason)
  const source = readFileSync(entry, 'utf8')
  DIRECT_TYPERT_CHECK.lastIndex = 0
  const next = source.replace(DIRECT_TYPERT_CHECK, (_match, ctx) => (
    `typeof (${ctx}?.get?.("typertGateway") ?? ${ctx}?.typertGateway)?.stream === "function"`
  ))
  if (next === source) {
    return result('incompatible', 'Typert Gateway 兼容处理未命中预期入口 / Typert Gateway compatibility preparation did not match the expected entry')
  }
  replaceFileBreakingHardLinks(entry, next)
  const verified = inspectKnownPluginCompatibility(profileDirectory, name)
  if (verified.status !== 'compatible') return result('incompatible', verified.reason)
  return result('compatible', verified.reason, true)
}

function setBundleMembership(profileDirectory, name, enabled) {
  const manifestPath = join(profileDirectory, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return false
  }
  manifest.dsh ??= {}
  manifest.dsh.profile ??= {}
  const current = Array.isArray(manifest.dsh.profile.bundles)
    ? manifest.dsh.profile.bundles.filter(value => typeof value === 'string')
    : []
  const next = enabled
    ? (current.includes(name) ? current : [...current, name])
    : current.filter(value => value !== name)
  if (JSON.stringify(next) === JSON.stringify(current)) return false
  manifest.dsh.profile.bundles = next
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return true
}

/**
 * Prepare a known package after install/update and reconcile its durable
 * profile membership. Dependencies and plugin-owned data are never removed.
 */
export function reconcileKnownPluginCompatibility(profileDirectory, name) {
  const prepared = prepareKnownPluginCompatibility(profileDirectory, name)
  if (prepared.status === 'irrelevant') return prepared
  const compatible = prepared.status === 'compatible'
  const membershipChanged = setBundleMembership(profileDirectory, name, compatible)
  return Object.freeze({ ...prepared, changed: prepared.changed || membershipChanged })
}
