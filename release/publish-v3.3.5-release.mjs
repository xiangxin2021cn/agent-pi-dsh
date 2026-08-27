// Create v3.3.5 via the GitHub API so UTF-8 notes stay intact.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi-dsh'
const tag = 'v3.3.5'
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}

const body = readFileSync(join(root, 'release/github-notes-3.3.5.md'), 'utf8')
const existing = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers })
if (existing.ok) {
  const rel = await existing.json()
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/${rel.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Agent π 3.3.5',
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })
  if (!res.ok) throw new Error(`patch ${tag}: ${res.status} ${await res.text()}`)
  const updated = await res.json()
  const clean = !updated.body.includes('\uFFFD') && updated.body.includes('工程量')
  console.log(`patched ${updated.html_url} (${updated.body.length} chars, clean=${clean})`)
} else {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: 'Agent π 3.3.5',
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })
  if (!res.ok) throw new Error(`create ${tag}: ${res.status} ${await res.text()}`)
  const created = await res.json()
  const clean = !created.body.includes('\uFFFD') && created.body.includes('工程量')
  console.log(`created ${created.html_url} (${created.body.length} chars, clean=${clean})`)
}


