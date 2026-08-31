// Create an immutable draft v3.5.2 release, then publish it only after all assets exist.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi-dsh'
const tag = 'v3.5.2'
const apiRoot = `https://api.github.com/repos/${repo}`
const mode = process.argv[2]
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}
const jsonHeaders = { ...headers, 'content-type': 'application/json' }
const body = readFileSync(join(root, 'release/github-notes-3.5.2.md'), 'utf8')
const requiredAssets = new Set([
  'Agent-Pi-DSH-3.5.2-x64.exe',
  'Agent-Pi-DSH-3.5.2-x64.exe.sha256',
  'Agent-Pi-DSH-3.5.2-mac-arm64.dmg',
  'Agent-Pi-DSH-3.5.2-mac-arm64.zip',
  'Agent-Pi-DSH-3.5.2-linux-x86_64.AppImage',
  'Agent-Pi-DSH-3.5.2-linux-amd64.deb',
  'runtime-payload-3.5.2.tar.gz',
  'runtime-payload-3.5.2.tar.gz.sha256',
])

async function githubJson(path, label) {
  const response = await fetch(`${apiRoot}${path}`, { headers })
  if (!response.ok) throw new Error(`${label}: ${response.status} ${await response.text()}`)
  return response.json()
}

async function resolveTagCommit() {
  let object = (await githubJson(`/git/ref/tags/${encodeURIComponent(tag)}`, `lookup ${tag} tag`)).object
  while (object.type === 'tag') {
    object = (await githubJson(`/git/tags/${object.sha}`, `peel ${tag} tag`)).object
  }
  if (object.type !== 'commit') throw new Error(`${tag} does not resolve to a commit`)
  return object.sha
}

const existing = await fetch(`${apiRoot}/releases/tags/${tag}`, { headers })

if (mode === '--create-draft') {
  if (existing.ok) throw new Error(`${tag} already exists; published versions are immutable`)
  if (existing.status !== 404) throw new Error(`lookup ${tag}: ${existing.status} ${await existing.text()}`)
  const [tagCommit, mainCommit] = await Promise.all([
    resolveTagCommit(),
    githubJson('/commits/main', 'lookup main commit').then((commit) => commit.sha),
  ])
  if (tagCommit !== mainCommit) throw new Error(`${tag} must point at current main: ${tagCommit} != ${mainCommit}`)
  const response = await fetch(`${apiRoot}/releases`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: tag,
      name: 'Agent Pi DSH 3.5.2',
      body,
      draft: true,
      prerelease: false,
      make_latest: 'false',
    }),
  })
  if (!response.ok) throw new Error(`create ${tag}: ${response.status} ${await response.text()}`)
  const created = await response.json()
  console.log(`created draft ${created.html_url}`)
} else if (mode === '--publish') {
  if (!existing.ok) throw new Error(`${tag} draft is missing: ${existing.status}`)
  const release = await existing.json()
  if (!release.draft) throw new Error(`${tag} is already public; refusing to rewrite it`)
  const assetNames = new Set(release.assets.map((asset) => asset.name))
  const missing = [...requiredAssets].filter((name) => !assetNames.has(name))
  if (missing.length) throw new Error(`cannot publish ${tag}; missing assets: ${missing.join(', ')}`)
  const response = await fetch(`${apiRoot}/releases/${release.id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({
      name: 'Agent Pi DSH 3.5.2',
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })
  if (!response.ok) throw new Error(`publish ${tag}: ${response.status} ${await response.text()}`)
  const published = await response.json()
  console.log(`published ${published.html_url}`)
} else {
  throw new Error('Usage: publish-v3.5.2-release.mjs --create-draft | --publish')
}
