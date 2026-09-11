/**
 * Post-install activation verification (P0-2): what "installed" actually
 * means for a package in a dsh profile.
 *
 * The ground truth is the same manifest the dsh CLI reconciles:
 * `<profile>/package.json` → `dsh.profile.bundles`. A package is a
 * profile-layer plugin only when its name is in that list; a package
 * without `dsh.bundle` in its own manifest is never reconciled there and
 * therefore never activates through the normal boot path (client-only
 * plugins get a market-owned shim mount instead).
 *
 * State taxonomy (IMPROVEMENT-PLAN P0-2):
 *   live    – mounted into the running composition (hot mount present)
 *   restart – installed and will activate on the next boot, but not live now
 *   inert   – installed but incompatible with the active DSH runtime
 *   broken  – installed but validation failed (no dsh surface / no entry
 *             artifact) — the next boot could fail
 *   missing – not present in node_modules
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listHotMounts, parseSimplePatch } from './hot.ts'
import { hasDshManifest, hasLoadableEntry, profileDir } from './profile.ts'
import { inspectKnownPluginCompatibility, isTeamComponent, TEAM_MANAGED_REASON } from '../compatibility.js'

export type ActivationState = 'live' | 'preset' | 'restart' | 'inert' | 'broken' | 'missing'

export interface ActivationResult {
  state: ActivationState
  /** Bilingual, user-facing explanations (zh / en joined with " / "). */
  reasons: string[]
  /** True when the package is in the profile's `dsh.profile.bundles`. */
  bundle: boolean
  /** True when the package is live in the running composition. */
  hot: boolean
}

/** The profile manifest's `dsh.profile.bundles` — what the CLI reconciled. */
function readBundles(profile: string, explicitDir?: string): Set<string> {
  try {
    const manifest = JSON.parse(
      readFileSync(join(profileDir(profile, explicitDir), 'package.json'), 'utf8'),
    ) as { dsh?: { profile?: { bundles?: unknown } } }
    const bundles = manifest.dsh?.profile?.bundles
    return new Set(Array.isArray(bundles) ? bundles.filter((n): n is string => typeof n === 'string') : [])
  } catch {
    return new Set()
  }
}

interface PkgDsh {
  agentPi?: { presetModule?: boolean }
  bundle?: unknown
  client?: unknown
}

/**
 * True when `live` contains the package itself or a subpath entry of it.
 *
 * The live set (see `liveNames` in routes.ts) holds loader entry names — the
 * `name:` field of each bundle patch row. Bundles usually name the bare
 * package (`dshmarket`, `@scope/pkg`), but may point at a subpath entry
 * (`@vectorize-io/hindsight-coding-agents/dsh`, `aegis/extensions/dsh/index.js`).
 * Either form means the package's fiber is up and it must read as live;
 * a different package sharing a name prefix (`@scope/pkg2` vs `@scope/pkg`)
 * must not — the `/` bound keeps the match a real subpath.
 */
function liveIncludes(live: ReadonlySet<string>, packageName: string): boolean {
  if (live.has(packageName)) return true
  const prefix = `${packageName}/`
  for (const name of live) if (name.startsWith(prefix)) return true
  return false
}

function readPkgDsh(profile: string, name: string, explicitDir?: string): PkgDsh | null {
  try {
    const manifest = JSON.parse(
      readFileSync(join(profileDir(profile, explicitDir), 'node_modules', name, 'package.json'), 'utf8'),
    ) as { dsh?: PkgDsh }
    return manifest.dsh ?? {}
  } catch {
    return null
  }
}

function patchTextOf(profile: string, name: string, explicitDir?: string): string | null {
  try {
    return readFileSync(join(profileDir(profile, explicitDir), 'node_modules', name, 'cordis.patch.yml'), 'utf8')
  } catch {
    return null
  }
}

/**
 * Verify the activation state of one installed package.
 * @param live - names live in the current composition; defaults to the
 * market's hot-mount table (injectable for tests).
 */
export function verifyActivation(
  profile: string,
  name: string,
  live: ReadonlySet<string> = new Set(listHotMounts()),
  explicitDir?: string,
): ActivationResult {
  const activeProfileDir = profileDir(profile, explicitDir)
  const bundles = readBundles(profile, activeProfileDir)
  const inBundles = bundles.has(name)
  const dsh = readPkgDsh(profile, name, activeProfileDir)

  if (dsh === null) {
    return { state: 'missing', reasons: ['未安装 / not installed'], bundle: inBundles, hot: false }
  }

  const dir = join(activeProfileDir, 'node_modules', name)
  if (isTeamComponent(name)) {
    const prefix = '@deepseek-ai/dsh-experimental-'
    const hostBundle = `${prefix}agent-team-profile`
    const webBundle = `${prefix}agent-team-web-profile`
    const targets = name === hostBundle ? [`${prefix}agent-team`, `${prefix}tool-agent-team`]
      : name === webBundle ? [`${prefix}client-ui-agent-team`] : [name]
    const entries = [name, ...targets]
    const complete = entries.every(target => hasLoadableEntry(activeProfileDir, target))
      && (![hostBundle, webBundle].includes(name) || existsSync(join(dir, 'cordis.patch.yml')))
      && (name !== `${prefix}client-ui-agent-team` || existsSync(join(dir, 'lib/client.js')))
    const enabled = bundles.has(hostBundle) && bundles.has(webBundle)
    const loaded = enabled && targets.every(target => liveIncludes(live, target))
    return {
      state: !complete ? 'broken' : loaded ? 'live' : enabled ? 'restart' : 'preset',
      reasons: [!complete ? `Team 组件入口或加载层文件缺失，请修复安装 / Team component artifacts are missing; repair the installation`
        : `${loaded ? '官方 Team 加载层已生效' : enabled ? '已配置 Team 加载层，但尚未检测到运行实例；重启后若仍如此，请检查启动日志' : '团队协作尚未开启'} / ${loaded ? 'official Team layer is active' : enabled ? 'Team layers configured but not observed running; restart, then check startup logs if unresolved' : 'team collaboration is off'}。${TEAM_MANAGED_REASON}`],
      bundle: inBundles, hot: loaded,
    }
  }
  if (dsh.agentPi?.presetModule === true && name === 'dsh-agent-pi-compaction') {
    const loaded = liveIncludes(live, name)
    const entryExists = hasLoadableEntry(activeProfileDir, name)
    return {
      state: !entryExists ? 'broken' : loaded ? 'live' : 'preset',
      reasons: [!entryExists ? '预设模块入口缺失 / preset module entry is missing'
        : loaded ? '已由对话预设加载；自动压缩组件 / loaded by the conversation preset; automatic compaction'
          : '内置预设模块，由对话预设加载；无需作为独立插件启用 / built-in preset module; loaded by conversation presets, not a standalone bundle'],
      bundle: false, hot: loaded,
    }
  }
  if (!hasDshManifest(dir)) {
    return {
      state: 'broken',
      reasons: ['该包未声明 dsh 元数据,不会在启动时加载 / this package declares no dsh metadata and will never load'],
      bundle: inBundles,
      hot: false,
    }
  }
  // Carrier bundles (#103) ship no entry of their own — what they mount is
  // the point — so judge by "is anything loadable", not by this package's
  // own artifact.
  if (!hasLoadableEntry(activeProfileDir, name)) {
    return {
      state: 'broken',
      reasons: [
        '声明的入口产物缺失(源码检出或构建被拦),下次启动会失败 / the declared entry artifact is missing (source-only checkout or blocked build) — the next boot would fail',
      ],
      bundle: inBundles,
      hot: false,
    }
  }

  const compatibility = inspectKnownPluginCompatibility(activeProfileDir, name)
  if (compatibility.status === 'incompatible') {
    return {
      state: 'inert',
      reasons: [compatibility.reason],
      bundle: inBundles,
      hot: false,
    }
  }
  if (compatibility.status === 'repairable') {
    return {
      state: 'restart',
      reasons: [compatibility.reason],
      bundle: inBundles,
      hot: false,
    }
  }

  if (liveIncludes(live, name)) {
    const clientOnly = dsh.bundle === undefined && dsh.client !== undefined
    return {
      state: 'live',
      reasons: [
        clientOnly
          ? '已热加载(纯客户端插件 shim)/ live via the client-only shim'
          : '已热加载(bundle patch)/ live via its bundle patch',
      ],
      bundle: inBundles,
      hot: true,
    }
  }

  if (inBundles) {
    const patch = patchTextOf(profile, name, activeProfileDir)
    const complex = patch !== null && parseSimplePatch(patch) === null
    return {
      state: 'restart',
      reasons: [
        complex
          ? 'bundle patch 含配置/表达式,热挂载仅支持纯 insert;重启后由 bundle 层生效 / the bundle patch contains config/expression rows; hot-mount only supports plain inserts — it activates on restart'
          : '已进入 profile bundle 层但本次未能热挂载;重启后生效 / in the bundle layer but not hot-mounted this session — it activates on restart',
      ],
      bundle: true,
      hot: false,
    }
  }

  // Not a profile-layer plugin. Client-only packages never enter bundles
  // (the dsh CLI skips them), so the market shim-mounts them at boot —
  // report the useful lifecycle state rather than an internal layer detail.
  if (dsh.client !== undefined) {
    return {
      state: 'restart',
      reasons: [
        '兼容的纯客户端插件，待重启后由市场自动挂载 / compatible client-only plugin; the market mounts it on the next boot',
      ],
      bundle: false,
      hot: false,
    }
  }

  return {
    state: 'inert',
    reasons: [
      '不兼容：未声明 dsh.bundle 或 dsh.client，没有可激活的 DSH 接入面 / incompatible: no dsh.bundle or dsh.client activation surface is declared',
    ],
    bundle: false,
    hot: false,
  }
}
