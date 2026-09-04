/**
 * Registry access: fetch the curated list from awesome-dsh-plugin.com with an
 * in-memory cache, falling back to the bundled snapshot when offline.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface RegistryPlugin {
  name: string
  owner: string
  url: string
  category: string
  description: Record<string, string>
  npm?: string | null
  stars?: number | null
  install: string
  added: string
  /**
   * Catalog-side deprecation flags (#60): supplied by awesome-dsh-plugin,
   * absent for every normal entry — the market only consumes them, so a
   * catalog without the fields behaves exactly as before.
   */
  deprecated?: boolean
  /** Catalog name of the suggested replacement plugin, when deprecated. */
  replacement?: string
}

export interface Registry {
  updated: string
  count: number
  categories: Record<string, Record<string, string>>
  plugins: RegistryPlugin[]
}

const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const TTL_MS = 60 * 60 * 1000

let cache: { at: number; data: Registry } | null = null

const AGENT_PI_UNIVER: RegistryPlugin = {
  name: 'dsh-univer-office',
  owner: 'dream-num',
  url: 'https://github.com/dream-num/dsh-univer-office',
  npm: 'dsh-univer-office',
  category: 'tools',
  description: {
    zh: '可选 Office 预览插件。其运行依赖 Univer Pro 商业组件，安装和使用前须自行取得适用的商业许可；与 DSH 0.1.2-rc.1 的兼容性仍待验证，本版本不预装。',
    en: 'Optional Office preview plugin. Its runtime depends on commercial Univer Pro components; obtain the applicable commercial license before installing or using it. Compatibility with DSH 0.1.2-rc.1 is pending verification, and it is not preinstalled.',
  },
  install: 'dsh plugin --profile tender add dsh-univer-office',
  added: '2026-09-04',
}

export function applyAgentPiUniverPolicy(registry: Registry): Registry {
  const plugins = registry.plugins.map((plugin) => {
    if (plugin.name !== AGENT_PI_UNIVER.name && plugin.npm !== AGENT_PI_UNIVER.npm) return plugin
    return { ...plugin, description: AGENT_PI_UNIVER.description }
  })
  if (!plugins.some((plugin) => plugin.name === AGENT_PI_UNIVER.name || plugin.npm === AGENT_PI_UNIVER.npm)) {
    plugins.push(AGENT_PI_UNIVER)
  }
  return { ...registry, count: plugins.length, plugins }
}

function snapshot(): Registry {
  const path = fileURLToPath(new URL('../data/registry-snapshot.json', import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as Registry
}

export async function loadRegistry(): Promise<{ registry: Registry; source: 'live' | 'cache' | 'snapshot' }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { registry: applyAgentPiUniverPolicy(cache.data), source: 'cache' }
  }
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as Registry
    if (!Array.isArray(data.plugins) || data.plugins.length === 0) throw new Error('empty registry')
    cache = { at: Date.now(), data }
    return { registry: applyAgentPiUniverPolicy(data), source: 'live' }
  } catch {
    return {
      registry: applyAgentPiUniverPolicy(cache?.data ?? snapshot()),
      source: cache ? 'cache' : 'snapshot',
    }
  }
}
