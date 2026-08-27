// Publishes the website-styled GitHub homepage (README + light-theme assets)
// and updates the repository About card. One commit on agent-pi main.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

async function api(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
  if (res.status === 204) return null
  return res.json()
}

async function blob(absPath, encoding = 'base64') {
  const bytes = readFileSync(absPath)
  const created = await api('/git/blobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: encoding === 'utf-8' ? bytes.toString('utf8') : bytes.toString('base64'),
      encoding,
    }),
  })
  return created.sha
}

const files = [
  { path: 'README.md', abs: join(root, 'release/github-readme.md'), encoding: 'utf-8' },
  { path: 'release/notes-3.3.5.md', abs: join(root, 'release/notes-3.3.5.md'), encoding: 'utf-8' },
  { path: 'docs/assets/hero-flow-light.webp', abs: join(root, 'release/github-assets/hero-flow-light.webp') },
  { path: 'docs/assets/logo.png', abs: join(root, 'release/github-assets/logo.png') },
  { path: 'docs/assets/studio-logo.png', abs: join(root, 'release/github-assets/studio-logo.png') },
  { path: 'docs/assets/screenshot-market.jpg', abs: join(root, 'release/github-assets/screenshot-market.jpg') },
]

const ref = await api('/git/ref/heads/main')
const headSha = ref.object.sha
const head = await api(`/git/commits/${headSha}`)
console.log(`main @ ${headSha.slice(0, 8)}`)

const tree = []
for (const file of files) {
  const sha = await blob(file.abs, file.encoding)
  tree.push({ path: file.path, mode: '100644', type: 'blob', sha })
  console.log(`blob ${file.path}`)
}

const newTree = await api('/git/trees', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ base_tree: head.tree.sha, tree }),
})

const commit = await api('/git/commits', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    message: 'docs: publish v3.3.5 download links on GitHub homepage',
    tree: newTree.sha,
    parents: [headSha],
  }),
})

await api('/git/refs/heads/main', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sha: commit.sha }),
})
console.log(`committed ${commit.sha}`)

await api('', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    homepage: 'https://www.agent-pi.app',
    description:
      '工程企业的垂直智能体：投标、实施、投资。长程任务一次跑完。Desktop workbench on DeepSeek Harness — www.agent-pi.app',
  }),
})
console.log('About card updated')
