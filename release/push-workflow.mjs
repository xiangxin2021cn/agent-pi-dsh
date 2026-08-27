// Publishes .github/workflows/build-desktop-assets.yml to the agent-pi repo
// and dispatches it for a given tag. Raw API keeps this independent of gh CLI
// quirks; requires the gh token to carry the workflow scope.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi-dsh'
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}
const wfPath = '.github/workflows/build-desktop-assets.yml'
const tag = process.argv[2] || 'v3.1.0'

const repoInfo = await (await fetch(`https://api.github.com/repos/${repo}`, { headers })).json()
const branch = repoInfo.default_branch
console.log(`default branch: ${branch}`)

const content = readFileSync(join(root, wfPath))
const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${wfPath}?ref=${branch}`, { headers })
const existing = getRes.ok ? await getRes.json() : null

const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${wfPath}`, {
  method: 'PUT',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    message: 'ci: build macOS/Linux desktop assets from release runtime payload',
    content: content.toString('base64'),
    branch,
    ...(existing && existing.sha ? { sha: existing.sha } : {}),
  }),
})
if (!putRes.ok) throw new Error(`PUT workflow: ${putRes.status} ${await putRes.text()}`)
console.log('workflow file committed')

const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/build-desktop-assets.yml/dispatches`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ ref: branch, inputs: { tag } }),
})
if (dispatchRes.status !== 204) throw new Error(`dispatch: ${dispatchRes.status} ${await dispatchRes.text()}`)
console.log(`workflow dispatched for ${tag}`)
