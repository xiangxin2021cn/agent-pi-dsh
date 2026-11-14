import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const packages = ['agent-team-profile', 'agent-team', 'tool-agent-team', 'client-ui-agent-team']
export const TEAM_BUNDLES = packages.map(name => `@deepseek-ai/dsh-experimental-${name}`)

// rc.3 mounts Teams in the official base/web bundles, with a per-session switch.
export function retireLegacyTeamLinks(profileDir) {
  const path = join(profileDir, 'package.json')
  if (!existsSync(path)) return false
  const text = readFileSync(path, 'utf8')
  const manifest = JSON.parse(text)
  let changed = false
  for (const [index, name] of TEAM_BUNDLES.entries()) {
    const spec = manifest.dependencies?.[name]
    if (typeof spec !== 'string' || !spec.startsWith('link:')) continue
    const normalized = spec.replaceAll('\\', '/').replace(/\/$/, '')
    if (!normalized.endsWith('/deepseek-harness/packages/experimental/' + packages[index])) continue
    delete manifest.dependencies[name]
    changed = true
  }
  if (!changed) return false
  if (Array.isArray(manifest.dsh?.profile?.bundles)) {
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => !TEAM_BUNDLES.includes(name))
  }
  const backup = path + '.pre-3.9.0-teams.bak'
  if (!existsSync(backup)) copyFileSync(path, backup)
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  return true
}
