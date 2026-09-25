import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const repo = 'xiangxin2021cn/agent-pi-dsh'
export function validateParts(manifest, receipt, tag, commit) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/)
  const name = `Agent-Pi-DSH-${tag.slice(1)}-x64.exe`
  assert.equal(receipt.releaseTag, tag)
  assert.equal(receipt.sourceCommit, commit)
  assert.equal(receipt.installer.name, name)
  assert.equal(manifest.name, name)
  assert.equal(manifest.sha256, receipt.installer.sha256)
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.bytes, receipt.installer.bytes)
  assert(Number.isSafeInteger(manifest.bytes) && manifest.bytes > 0)
  assert(Array.isArray(manifest.parts) && manifest.parts.length > 0 && manifest.parts.length <= 200)
  let bytes = 0
  for (const [index, part] of manifest.parts.entries()) {
    assert.equal(part.name, `${name}.part-${String(index).padStart(4, '0')}`)
    assert.match(part.sha256, /^[a-f0-9]{64}$/)
    assert(Number.isSafeInteger(part.bytes) && part.bytes > 0 && part.bytes <= 16 * 1024 * 1024)
    bytes += part.bytes
  }
  assert.equal(bytes, manifest.bytes)
  return name
}
async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, repo)
  const tag = process.env.RELEASE_TAG
  assert.match(tag, /^v\d+\.\d+\.\d+$/)
  const name = `Agent-Pi-DSH-${tag.slice(1)}-x64.exe`
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const api = path => JSON.parse(gh('api', `repos/${repo}/${path}`))
  let object = api(`git/ref/tags/${tag}`).object
  while (object.type === 'tag') object = api(`git/tags/${object.sha}`).object
  assert.equal(object.type, 'commit')
  const release = api(`releases/tags/${tag}`)
  assert(release.draft, 'assembly is allowed only on a draft')
  assert(!release.assets.some(asset => asset.name === name), 'installer already exists')
  const dir = 'release-parts'
  mkdirSync(dir)
  for (const pattern of [`${name}.parts.json`, `${name}.build.json`, `${name}.sha256`, `${name}.part-*`]) {
    gh('release', 'download', tag, '--repo', repo, '--pattern', pattern, '--dir', dir)
  }
  const manifest = JSON.parse(readFileSync(join(dir, `${name}.parts.json`)))
  const receipt = JSON.parse(readFileSync(join(dir, `${name}.build.json`)))
  validateParts(manifest, receipt, tag, object.sha)
  assert.equal(readFileSync(join(dir, `${name}.sha256`), 'utf8').trim().toLowerCase(), `${manifest.sha256}  ${name.toLowerCase()}`)
  const hash = createHash('sha256')
  const cleanup = []
  writeFileSync(name, '', { flag: 'wx' })
  for (const part of manifest.parts) {
    const asset = release.assets.find(asset => asset.name === part.name)
    assert(asset && asset.state === 'uploaded' && asset.size === part.bytes)
    assert.equal(asset.digest, `sha256:${part.sha256}`)
    const bytes = readFileSync(join(dir, part.name))
    assert.equal(bytes.length, part.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), part.sha256)
    appendFileSync(name, bytes)
    hash.update(bytes)
    cleanup.push(asset)
  }
  assert.equal(hash.digest('hex'), receipt.installer.sha256)
  assert(api(`releases/${release.id}`).draft)
  gh('release', 'upload', tag, name, '--repo', repo)
  const updated = api(`releases/${release.id}`)
  assert(updated.draft)
  const uploaded = updated.assets.find(asset => asset.name === name)
  assert(uploaded && uploaded.state === 'uploaded' && uploaded.size === manifest.bytes)
  assert.equal(uploaded.digest, `sha256:${manifest.sha256}`)
  cleanup.push(release.assets.find(asset => asset.name === `${name}.parts.json`))
  for (const asset of cleanup) {
    assert(asset && (asset.name.startsWith(`${name}.part-`) || asset.name === `${name}.parts.json`))
    gh('api', '--method', 'DELETE', `repos/${repo}/releases/assets/${asset.id}`)
  }
  console.log(`Verified and uploaded original installer: ${name}, sha256 ${manifest.sha256}`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
