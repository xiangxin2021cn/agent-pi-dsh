// Create an immutable draft v3.5.3 release, then publish it only after all assets exist.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi-dsh'
const tag = 'v3.5.3'
const apiRoot = `https://api.github.com/repos/${repo}`
const mode = process.argv[2]
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}
const jsonHeaders = { ...headers, 'content-type': 'application/json' }
const body = readFileSync(join(root, 'release/github-notes-3.5.3.md'), 'utf8')
const requiredAssets = new Set([
  'Agent-Pi-DSH-3.5.3-x64.exe',
  'Agent-Pi-DSH-3.5.3-x64.exe.sha256',
  'Agent-Pi-DSH-3.5.3-mac-arm64.dmg',
  'Agent-Pi-DSH-3.5.3-mac-arm64.zip',
  'Agent-Pi-DSH-3.5.3-linux-x86_64.AppImage',
  'Agent-Pi-DSH-3.5.3-linux-amd64.deb',
  'runtime-payload-3.5.3.tar.gz',
  'runtime-payload-3.5.3.tar.gz.sha256',
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

const releases = await githubJson('/releases?per_page=100', 'list releases')
const existing = releases.find((release) => release.tag_name === tag)

if (mode === '--create-draft') {
  if (existing) throw new Error(`${tag} already exists; published versions are immutable`)
  const tagCommit = await resolveTagCommit()
  const comparison = await githubJson(`/compare/${tagCommit}...main`, `verify ${tag} on main`)
  if (!['identical', 'ahead'].includes(comparison.status)) {
    throw new Error(`${tag} must point to a commit in main history; comparison status is ${comparison.status}`)
  }
  const response = await fetch(`${apiRoot}/releases`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      tag_name: tag,
      name: 'Agent Pi DSH 3.5.3',
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
  if (!existing) throw new Error(`${tag} draft is missing`)
  const release = existing
  if (!release.draft) throw new Error(`${tag} is already public; refusing to rewrite it`)
  const uploadedAssetNames = release.assets.map((asset) => asset.name)
  const assetNames = new Set(uploadedAssetNames)
  const missing = [...requiredAssets].filter((name) => !assetNames.has(name))
  const extra = uploadedAssetNames.filter((name) => !requiredAssets.has(name))
  if (missing.length || extra.length || uploadedAssetNames.length !== requiredAssets.size) {
    throw new Error(
      `cannot publish ${tag}; expected exactly ${requiredAssets.size} assets; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    )
  }
  const response = await fetch(`${apiRoot}/releases/${release.id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({
      name: 'Agent Pi DSH 3.5.3',
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
  throw new Error('Usage: publish-v3.5.3-release.mjs --create-draft | --publish')
}
