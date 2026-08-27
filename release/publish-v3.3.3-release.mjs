// Create v3.3.3 via the GitHub API so UTF-8 notes stay intact, then
// `gh release upload` attaches the Windows installer and runtime payload.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi'
const tag = 'v3.3.3'
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}

const body = readFileSync(join(root, 'release/github-notes-3.3.3.md'), 'utf8')
const existing = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers })
if (existing.ok) {
  console.log(`${tag} already exists`)
} else {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: 'Agent π 3.3.3',
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })
  if (!res.ok) throw new Error(`create ${tag}: ${res.status} ${await res.text()}`)
  const created = await res.json()
  const clean = !created.body.includes('\uFFFD') && created.body.includes('南非')
  console.log(`created ${created.html_url} (${created.body.length} chars, clean=${clean})`)
}
