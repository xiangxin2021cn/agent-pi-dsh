// Patches GitHub release bodies over the raw API. The gh CLI on this Windows
// host munges UTF-8 notes files through the ANSI codepage (the 3.0.0 mojibake);
// Node's fetch keeps bytes intact end to end.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi'
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}

async function patchNotes(tag, file) {
  const body = readFileSync(file, 'utf8')
  const rel = await (await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers })).json()
  if (!rel.id) throw new Error(`no release for ${tag}: ${JSON.stringify(rel).slice(0, 200)}`)
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/${rel.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(`${tag}: ${res.status} ${await res.text()}`)
  const updated = await res.json()
  const clean = !updated.body.includes('\uFFFD') && updated.body.includes('\u2014')
  console.log(`${tag}: patched ${updated.body.length} chars, clean=${clean}`)
}

await patchNotes('v3.1.0', new URL('./notes-3.1.0.md', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
await patchNotes('v3.0.0', new URL('./notes-3.0.0.md', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
