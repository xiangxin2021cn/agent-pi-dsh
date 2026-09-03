// Create an immutable draft v3.6.0 release, then publish it only after all
// platform, runtime, and CAD corresponding-source assets are complete.
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyCadCleanRelease } from '../scripts/cad-clean-release.mjs'
import { verifyWindowsBuildReceipt } from '../scripts/windows-build-receipt.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = 'xiangxin2021cn/agent-pi-dsh'
const tag = 'v3.6.0'
const apiRoot = `https://api.github.com/repos/${repo}`
const mode = process.argv[2]
const sourceAsset = 'Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz'
const sourceChecksumAsset = 'Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz.sha256'
const windowsBuildReceiptAsset = 'Agent-Pi-DSH-3.6.0-x64.exe.build.json'
const platformChecksumPairs = [
  ['Agent-Pi-DSH-3.6.0-mac-arm64.dmg', 'Agent-Pi-DSH-3.6.0-mac-arm64.dmg.sha256'],
  ['Agent-Pi-DSH-3.6.0-mac-arm64.zip', 'Agent-Pi-DSH-3.6.0-mac-arm64.zip.sha256'],
  ['Agent-Pi-DSH-3.6.0-linux-x86_64.AppImage', 'Agent-Pi-DSH-3.6.0-linux-x86_64.AppImage.sha256'],
  ['Agent-Pi-DSH-3.6.0-linux-amd64.deb', 'Agent-Pi-DSH-3.6.0-linux-amd64.deb.sha256'],
]

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function assertReleaseCheckout() {
  const status = execSync('git status --porcelain=v1 --untracked-files=all', { cwd: root, encoding: 'utf8' }).trim()
  if (status) throw new Error('v3.6.0 publishing requires a completely clean checkout')
  const exactTag = execSync('git describe --exact-match --tags HEAD', { cwd: root, encoding: 'utf8' }).trim()
  if (exactTag !== tag) throw new Error(`publishing checkout must be the exact ${tag} tag`)
}

function assertGplReleaseMetadata() {
  for (const relativePath of ['package.json', 'apps/desktop/package.json', 'tools/mlightcad-poc/package.json']) {
    const manifest = JSON.parse(readFileSync(join(root, relativePath), 'utf8'))
    if (manifest.license !== 'GPL-3.0-only') throw new Error(`${relativePath} must declare GPL-3.0-only`)
  }
  const license = readFileSync(join(root, 'LICENSE'), 'utf8')
  if (!license.includes('GNU GENERAL PUBLIC LICENSE') || !license.includes('Version 3, 29 June 2007')) {
    throw new Error('release-root LICENSE must contain the GPLv3 text')
  }
}

async function assertChecksumPair(fileName) {
  const filePath = join(root, 'release', fileName)
  const checksumPath = `${filePath}.sha256`
  if (!existsSync(filePath) || !existsSync(checksumPath)) {
    throw new Error(`release checksum pair is incomplete: ${fileName}`)
  }
  const checksum = readFileSync(checksumPath, 'utf8').trim()
  const match = checksum.match(/^([a-f0-9]{64})  ([^/\\]+)$/i)
  if (!match || match[2] !== fileName || await sha256(filePath) !== match[1].toLowerCase()) {
    throw new Error(`release checksum does not match ${fileName}`)
  }
}

async function assertCadDistributionReady() {
  assertReleaseCheckout()
  assertGplReleaseMetadata()

  await assertChecksumPair('Agent-Pi-DSH-3.6.0-x64.exe')
  await assertChecksumPair('runtime-payload-3.6.0.tar.gz')
  await assertChecksumPair(sourceAsset)

  const archivePath = join(root, 'release', sourceAsset)
  const checksumPath = join(root, 'release', sourceChecksumAsset)

  const cadRuntimeRoot = process.env.AGENT_PI_CAD_CLEAN_OUTPUT
    ? join(process.env.AGENT_PI_CAD_CLEAN_OUTPUT, 'cad-viewer')
    : join(root, '.codex-temp', 'cad-clean-output', 'cad-viewer')
  const manifest = verifyCadCleanRelease({
    archivePath,
    checksumPath,
    runtimeDir: cadRuntimeRoot,
  })
  const releaseCommit = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim()
  if (manifest.sources.agentPiDshCadIntegration.commit !== releaseCommit) {
    throw new Error('CAD corresponding source was not built from this exact release commit')
  }

  verifyWindowsBuildReceipt({
    root,
    installerPath: join(root, 'release', 'Agent-Pi-DSH-3.6.0-x64.exe'),
    payloadPath: join(root, 'apps', 'desktop', 'dist-nsis', 'payload.7z'),
    cadRuntimeDir: join(root, 'apps', 'desktop', 'dist-unpacked', 'win-unpacked', 'resources', 'runtime', 'product', 'bundles', 'tender-web', 'lib', 'cad-viewer'),
    cadSourcePath: archivePath,
    dshReceiptPath: join(root, 'apps', 'desktop', 'dist-unpacked', 'win-unpacked', 'resources', 'runtime', 'deepseek-harness', 'DSH-BUILD-RECEIPT.json'),
    receiptPath: join(root, 'release', windowsBuildReceiptAsset),
  })
}

if (!['--create-draft', '--publish'].includes(mode)) {
  throw new Error('Usage: publish-v3.6.0-release.mjs --create-draft | --publish')
}

await assertCadDistributionReady()

const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}
const jsonHeaders = { ...headers, 'content-type': 'application/json' }
const body = readFileSync(join(root, 'release/github-notes-3.6.0.md'), 'utf8')
const requiredAssets = new Set([
  'Agent-Pi-DSH-3.6.0-x64.exe',
  'Agent-Pi-DSH-3.6.0-x64.exe.sha256',
  windowsBuildReceiptAsset,
  'Agent-Pi-DSH-3.6.0-mac-arm64.dmg',
  'Agent-Pi-DSH-3.6.0-mac-arm64.dmg.sha256',
  'Agent-Pi-DSH-3.6.0-mac-arm64.zip',
  'Agent-Pi-DSH-3.6.0-mac-arm64.zip.sha256',
  'Agent-Pi-DSH-3.6.0-linux-x86_64.AppImage',
  'Agent-Pi-DSH-3.6.0-linux-x86_64.AppImage.sha256',
  'Agent-Pi-DSH-3.6.0-linux-amd64.deb',
  'Agent-Pi-DSH-3.6.0-linux-amd64.deb.sha256',
  'runtime-payload-3.6.0.tar.gz',
  'runtime-payload-3.6.0.tar.gz.sha256',
  sourceAsset,
  sourceChecksumAsset,
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

async function assertRemoteReleaseCommit() {
  const localCommit = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim()
  const remoteCommit = await resolveTagCommit()
  if (remoteCommit !== localCommit) {
    throw new Error(`${tag} resolves to ${remoteCommit}, but the verified local release commit is ${localCommit}`)
  }
  const comparison = await githubJson(`/compare/${remoteCommit}...main`, `verify ${tag} on main`)
  if (comparison.status !== 'identical') {
    throw new Error(`${tag} must point to the current main commit; comparison status is ${comparison.status}`)
  }
}

async function readUploadedChecksum(asset) {
  const response = await fetch(asset.url, {
    headers: { ...headers, accept: 'application/octet-stream' },
  })
  if (!response.ok) {
    throw new Error(`download ${asset.name}: ${response.status} ${await response.text()}`)
  }
  return (await response.text()).trim()
}

async function assertUploadedAssets(release) {
  const uploadedAssetNames = release.assets.map((asset) => asset.name)
  const assetNames = new Set(uploadedAssetNames)
  const missing = [...requiredAssets].filter((name) => !assetNames.has(name))
  const extra = uploadedAssetNames.filter((name) => !requiredAssets.has(name))
  if (missing.length || extra.length || uploadedAssetNames.length !== requiredAssets.size) {
    throw new Error(
      `cannot publish ${tag}; expected exactly ${requiredAssets.size} assets; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    )
  }

  for (const asset of release.assets) {
    if (asset.state !== 'uploaded' || !Number.isFinite(asset.size) || asset.size <= 0 ||
      !/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) {
      throw new Error(`release asset is incomplete or lacks a GitHub SHA256 digest: ${asset.name}`)
    }
  }

  for (const [fileName, checksumName] of platformChecksumPairs) {
    const fileAsset = release.assets.find((asset) => asset.name === fileName)
    const checksumAsset = release.assets.find((asset) => asset.name === checksumName)
    const checksum = await readUploadedChecksum(checksumAsset)
    const match = checksum.match(/^([a-f0-9]{64})  ([^/\\]+)$/i)
    if (!match || match[2] !== fileName ||
      fileAsset.digest.toLowerCase() !== `sha256:${match[1].toLowerCase()}`) {
      throw new Error(`uploaded platform checksum does not match ${fileName}`)
    }
  }

  for (const name of [
    'Agent-Pi-DSH-3.6.0-x64.exe',
    'Agent-Pi-DSH-3.6.0-x64.exe.sha256',
    windowsBuildReceiptAsset,
    'runtime-payload-3.6.0.tar.gz',
    'runtime-payload-3.6.0.tar.gz.sha256',
    sourceAsset,
    sourceChecksumAsset,
  ]) {
    const path = join(root, 'release', name)
    if (!existsSync(path)) throw new Error(`local verified release asset is missing: ${name}`)
    const asset = release.assets.find((candidate) => candidate.name === name)
    const localDigest = await sha256(path)
    if (asset.size !== statSync(path).size || asset.digest.toLowerCase() !== `sha256:${localDigest}`) {
      throw new Error(`uploaded asset differs from the locally verified file: ${name}`)
    }
  }
}

const releases = await githubJson('/releases?per_page=100', 'list releases')
const existing = releases.find((release) => release.tag_name === tag)
await assertRemoteReleaseCommit()

if (mode === '--create-draft') {
  if (existing) throw new Error(`${tag} already exists; published versions are immutable`)
  const response = await fetch(`${apiRoot}/releases`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      tag_name: tag,
      name: 'Agent Pi DSH 3.6.0',
      body,
      draft: true,
      prerelease: false,
      make_latest: 'false',
    }),
  })
  if (!response.ok) throw new Error(`create ${tag}: ${response.status} ${await response.text()}`)
  const created = await response.json()
  console.log(`created draft ${created.html_url}`)
} else {
  if (!existing) throw new Error(`${tag} draft is missing`)
  const release = existing
  if (!release.draft) throw new Error(`${tag} is already public; refusing to rewrite it`)
  await assertUploadedAssets(release)
  const response = await fetch(`${apiRoot}/releases/${release.id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({
      name: 'Agent Pi DSH 3.6.0',
      body,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  })
  if (!response.ok) throw new Error(`publish ${tag}: ${response.status} ${await response.text()}`)
  const published = await response.json()
  console.log(`published ${published.html_url}`)
}
