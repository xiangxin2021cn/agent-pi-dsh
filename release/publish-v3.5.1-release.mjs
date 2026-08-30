// Create or update v3.5.1 through the GitHub API so UTF-8 notes stay intact.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi-dsh'
const tag = 'v3.5.1'
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}

const body = readFileSync(join(root, 'release/github-notes-3.5.1.md'), 'utf8')
const existing = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers })
if (existing.ok) {
  const release = await existing.json()
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/${release.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Agent π 3.5.1',
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })
  if (!response.ok) throw new Error(`patch ${tag}: ${response.status} ${await response.text()}`)
  const updated = await response.json()
  const clean = !updated.body.includes('\uFFFD') && updated.body.includes('执行账本')
  console.log(`patched ${updated.html_url} (${updated.body.length} chars, clean=${clean})`)
} else {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'codex/dsh-3.4.3-workbench-chat-handoff',
      name: 'Agent π 3.5.1',
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })
  if (!response.ok) throw new Error(`create ${tag}: ${response.status} ${await response.text()}`)
  const created = await response.json()
  const clean = !created.body.includes('\uFFFD') && created.body.includes('执行账本')
  console.log(`created ${created.html_url} (${created.body.length} chars, clean=${clean})`)
}
