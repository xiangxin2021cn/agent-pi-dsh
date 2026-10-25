// Create an immutable draft v3.8.5 release, then publish it only after all
// platform, runtime, and CAD/BIM corresponding-source assets are complete.
import { createHash } from 'node:crypto'
import { execFileSync, execSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyCadCleanRelease } from '../scripts/cad-clean-release.mjs'
import { assertCadIntegrationUnchanged } from '../scripts/cad-integration-compatibility.mjs'
import { verifyCadHostCleanRelease } from '../scripts/cad-host-clean-release.mjs'
import { verifyBimPublicRelease } from '../scripts/bim-public-release.mjs'
import {
  assertUniverPublicReleaseArchive,
  assertUniverPublicReleaseTree,
} from '../scripts/univer-public-release.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = 'xiangxin2021cn/agent-pi-dsh'
const tag = 'v3.8.5'
const publishedSourceCommit = 'd8b8e6d1a55ff3e383b340f09cca44d2e38478cf'
const maintenanceFiles = new Set([
  '.github/workflows/build-desktop-assets.yml',
  'scripts/verify-macos-intel.py',
  'scripts/tests/test_verify_macos_intel.py',
  'scripts/platform-release-385.test.mjs',
  'release/publish-v3.8.5-release.mjs',
  'release/RELEASE_POLICY.md',
  'release/github-notes-3.8.5.md',
  'README.md',
  'website/assets/js/main.js',
  'website/tests/downloads.test.mjs',
  'website/index.html',
])
const apiRoot = `https://api.github.com/repos/${repo}`
const mode = process.argv[2]
const sourceAsset = 'Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz'
const sourceChecksumAsset = 'Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz.sha256'
const cadHostSourceAsset = 'Agent-Pi-DSH-3.8.2-CAD-host-corresponding-source.tar.gz'
const bimSourceAsset = 'Agent-Pi-DSH-3.8.0-BIM-corresponding-source.tar.gz'
const windowsBuildReceiptAsset = 'Agent-Pi-DSH-3.8.5-x64.exe.build.json'
const preservedLinuxAssets = {
  'Agent-Pi-DSH-3.8.5-linux-amd64.deb': { size: 846164812, digest: 'sha256:370a79f3aecb3c50855859a07d60fca5a28355269672596b722261651d16ae7c' },
  'Agent-Pi-DSH-3.8.5-linux-amd64.deb.sha256': { size: 101, digest: 'sha256:ba66462b0f847b82920cb9b8d63d00da6a2ccc607a4bcb637758521cd8537668' },
  'Agent-Pi-DSH-3.8.5-linux-x86_64.AppImage': { size: 1082930063, digest: 'sha256:ce0fd4ccbd1a0da66d10f1dcfe3bc2ac9cd964810e39ab681798ef5b855d1d5d' },
  'Agent-Pi-DSH-3.8.5-linux-x86_64.AppImage.sha256': { size: 107, digest: 'sha256:74deaba8e0b8ec3b4f54b60bd34581c2d253922cbfd091fede6066af29782518' },
}
const platformChecksumPairs = [
  ['Agent-Pi-DSH-3.8.5-mac-arm64.dmg', 'Agent-Pi-DSH-3.8.5-mac-arm64.dmg.sha256'],
  ['Agent-Pi-DSH-3.8.5-mac-arm64.zip', 'Agent-Pi-DSH-3.8.5-mac-arm64.zip.sha256'],
  ['Agent-Pi-DSH-3.8.5-mac-x64.dmg', 'Agent-Pi-DSH-3.8.5-mac-x64.dmg.sha256'],
  ['Agent-Pi-DSH-3.8.5-mac-x64.zip', 'Agent-Pi-DSH-3.8.5-mac-x64.zip.sha256'],
  ['Agent-Pi-DSH-3.8.5-linux-x86_64.AppImage', 'Agent-Pi-DSH-3.8.5-linux-x86_64.AppImage.sha256'],
  ['Agent-Pi-DSH-3.8.5-linux-amd64.deb', 'Agent-Pi-DSH-3.8.5-linux-amd64.deb.sha256'],
]

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
}

function assertReleaseCheckout() {
  const product = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const desktop = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'), 'utf8'))
  if (product.version !== '3.8.5' || desktop.version !== product.version
      || product.agentPiProduct?.edition !== 'mainline'
      || desktop.agentPiProduct?.edition !== 'mainline'
      || product.agentPiProduct?.artifactStem !== 'Agent-Pi-DSH'
      || product.agentPiProduct?.releaseTagPrefix !== 'v') {
    throw new Error('v3.8.5 publishing requires the mainline product identity')
  }
  const status = git('status', '--porcelain=v1', '--untracked-files=all')
  if (status) throw new Error('v3.8.5 publishing requires a completely clean checkout')
  const headCommit = git('rev-parse', 'HEAD')
  if (git('rev-parse', `${tag}^{commit}`) !== publishedSourceCommit) throw new Error(`${tag} must retain its published source commit`)
  try { git('merge-base', '--is-ancestor', publishedSourceCommit, headCommit) }
  catch { throw new Error('v3.8.5 maintenance must descend from the published application source') }
  const changes = git('diff', '--name-status', '--no-renames', '-z', publishedSourceCommit, headCommit).split('\0').filter(Boolean)
  for (let index = 0; index < changes.length; index += 2) {
    if (changes[index] !== 'M' || !maintenanceFiles.has(changes[index + 1])) {
      throw new Error(`v3.8.5 maintenance changed an application or unapproved file: ${changes[index]} ${changes[index + 1]}`)
    }
  }
  return { headCommit }
}

function releaseNotes() {
  const body = readFileSync(join(root, 'release/github-notes-3.8.5.md'), 'utf8')
  const markers = [...body.matchAll(/<!--\s*agent-pi-release-meta:\s*({[\s\S]*?})\s*-->/g)]
  if (markers.length !== 1) throw new Error('v3.8.5 requires exactly one snapshot metadata marker')
  const identity = JSON.parse(markers[0][1])
  if (identity.schema !== 1 || identity.appVersion !== '3.8.5'
      || identity.kernel?.sourceKind !== 'official-master-snapshot'
      || identity.kernel.packageVersion !== '0.2.1-rc.3'
      || identity.kernel.commit !== '22ddee3792402c3e70ec5f86a63c3e3e895a2f60'
      || Object.hasOwn(identity.kernel, 'releaseTag')) throw new Error('v3.8.5 snapshot metadata differs from its immutable kernel source')
  return body
}

async function verifyFrozenWindowsBuildReceipt(options) {
  const receiptBytes = readFileSync(options.receiptPath)
  if (createHash('sha256').update(receiptBytes).digest('hex') !== '17e0ca2cacfde80fa094fb32969b28c8367dc7b87af539e97cc5128ebae8326b') {
    throw new Error('v3.8.5 Windows build receipt must retain its published bytes')
  }
  const receipt = JSON.parse(receiptBytes)
  const identity = { schemaVersion: 1, kind: 'agent-pi-dsh-windows-build', appVersion: '3.8.5', edition: 'mainline', artifactStem: 'Agent-Pi-DSH', releaseTag: tag, sourceCommit: publishedSourceCommit, dshPin: '22ddee3792402c3e70ec5f86a63c3e3e895a2f60' }
  for (const [key, expected] of Object.entries(identity)) {
    if (receipt[key] !== expected) throw new Error(`Windows build receipt ${key} mismatch`)
  }
  for (const [key, path] of Object.entries({
    installer: options.installerPath,
    installerPayload: options.payloadPath,
    cadRuntimeManifest: join(options.cadRuntimeDir, 'CAD-CLEAN-BUILD.json'),
    cadSource: options.cadSourcePath,
    dshBuildReceipt: options.dshReceiptPath,
  })) {
    if (!existsSync(path) || !statSync(path).isFile()
        || receipt[key]?.name !== basename(path) || receipt[key].bytes !== statSync(path).size
        || receipt[key].sha256 !== await sha256(path)) throw new Error(`Windows build receipt file mismatch: ${key}`)
  }
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
  const checkout = assertReleaseCheckout()
  const body = releaseNotes()
  assertGplReleaseMetadata()

  await assertChecksumPair('Agent-Pi-DSH-3.8.5-x64.exe')
  await assertChecksumPair('runtime-payload-3.8.5.tar.gz')
  await assertChecksumPair(sourceAsset)
  await assertChecksumPair(cadHostSourceAsset)
  await assertChecksumPair(bimSourceAsset)

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
  assertCadIntegrationUnchanged({ root, manifest, releaseCommit: publishedSourceCommit })

  const windowsRuntime = join(root, 'apps', 'desktop', 'dist-unpacked', 'win-unpacked', 'resources', 'runtime')
  const windowsProduct = join(windowsRuntime, 'product')
  await verifyFrozenWindowsBuildReceipt({
    installerPath: join(root, 'release', 'Agent-Pi-DSH-3.8.5-x64.exe'),
    payloadPath: join(root, 'apps', 'desktop', 'dist-nsis', 'payload.7z'),
    cadRuntimeDir: join(windowsProduct, 'bundles', 'tender-web', 'lib', 'cad-viewer'),
    cadSourcePath: archivePath,
    dshReceiptPath: join(windowsRuntime, 'deepseek-harness', 'DSH-BUILD-RECEIPT.json'),
    receiptPath: join(root, 'release', windowsBuildReceiptAsset),
  })
  for (const productRoot of [root, windowsProduct]) {
    const host = verifyCadHostCleanRelease(productRoot)
    const publicSource = join(root, 'release', cadHostSourceAsset)
    if (basename(host.sourceArchive.path) !== cadHostSourceAsset
        || statSync(publicSource).size !== host.sourceArchive.bytes
        || await sha256(publicSource) !== host.sourceArchive.sha256) {
      throw new Error('CAD host public source differs from the verified runtime source')
    }
  }
  verifyBimPublicRelease(join(windowsProduct, 'bundles', 'engineering-bim', 'runtime'), {
    sourceArchive: join(root, 'release', bimSourceAsset),
  })
  assertUniverPublicReleaseTree(windowsProduct)
  assertUniverPublicReleaseArchive(join(root, 'release', 'runtime-payload-3.8.5.tar.gz'))
  return { ...checkout, body }
}

if (!['--verify-local', '--create-draft', '--publish'].includes(mode)) {
  throw new Error('Usage: publish-v3.8.5-release.mjs --verify-local | --create-draft | --publish')
}

const verifiedRelease = await assertCadDistributionReady()

if (mode === '--verify-local') {
  console.log('v3.8.5 mainline local release inputs verified; no GitHub authentication or API access')
  process.exit(0)
}

const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}
const jsonHeaders = { ...headers, 'content-type': 'application/json' }
const body = `${verifiedRelease.body.trimEnd()}\n\n应用源码、Windows/Linux 与固定运行时载荷来源：[v3.8.5 / ${publishedSourceCommit}](https://github.com/${repo}/tree/${publishedSourceCommit})；macOS 打包与扫描运维来源：[${verifiedRelease.headCommit}](https://github.com/${repo}/commit/${verifiedRelease.headCommit})。DSH 内核来源仍为正文标注的官方固定快照。\n`
const requiredAssets = new Set([
  'Agent-Pi-DSH-3.8.5-x64.exe',
  'Agent-Pi-DSH-3.8.5-x64.exe.sha256',
  windowsBuildReceiptAsset,
  'Agent-Pi-DSH-3.8.5-mac-arm64.dmg',
  'Agent-Pi-DSH-3.8.5-mac-arm64.dmg.sha256',
  'Agent-Pi-DSH-3.8.5-mac-arm64.zip',
  'Agent-Pi-DSH-3.8.5-mac-arm64.zip.sha256',
  'Agent-Pi-DSH-3.8.5-mac-x64.dmg',
  'Agent-Pi-DSH-3.8.5-mac-x64.dmg.sha256',
  'Agent-Pi-DSH-3.8.5-mac-x64.zip',
  'Agent-Pi-DSH-3.8.5-mac-x64.zip.sha256',
  'Agent-Pi-DSH-3.8.5-linux-x86_64.AppImage',
  'Agent-Pi-DSH-3.8.5-linux-x86_64.AppImage.sha256',
  'Agent-Pi-DSH-3.8.5-linux-amd64.deb',
  'Agent-Pi-DSH-3.8.5-linux-amd64.deb.sha256',
  'runtime-payload-3.8.5.tar.gz',
  'runtime-payload-3.8.5.tar.gz.sha256',
  sourceAsset,
  sourceChecksumAsset,
  cadHostSourceAsset,
  `${cadHostSourceAsset}.sha256`,
  bimSourceAsset,
  `${bimSourceAsset}.sha256`,
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
  if (assertReleaseCheckout().headCommit !== verifiedRelease.headCommit) throw new Error('Verified v3.8.5 maintenance checkout changed before publication')
  const remoteCommit = await resolveTagCommit()
  if (remoteCommit !== publishedSourceCommit) {
    throw new Error(`${tag} must retain ${publishedSourceCommit}, found ${remoteCommit}`)
  }
  const main = await githubJson('/git/ref/heads/main', 'verify maintenance main')
  if (main.object?.type !== 'commit' || main.object.sha !== verifiedRelease.headCommit) throw new Error('Remote main must equal the verified local maintenance commit')
  const comparison = await githubJson(`/compare/${publishedSourceCommit}...${verifiedRelease.headCommit}`, `verify ${tag} maintenance ancestry`)
  if (!['identical', 'ahead'].includes(comparison.status) || comparison.merge_base_commit?.sha !== publishedSourceCommit) {
    throw new Error(`${tag} must remain an ancestor of the verified maintenance commit`)
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
  for (const [name, preserved] of Object.entries(preservedLinuxAssets)) {
    const asset = release.assets.find(candidate => candidate.name === name)
    if (asset.size !== preserved.size || asset.digest.toLowerCase() !== preserved.digest) throw new Error(`Existing Linux asset changed: ${name}`)
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
    'Agent-Pi-DSH-3.8.5-x64.exe',
    'Agent-Pi-DSH-3.8.5-x64.exe.sha256',
    windowsBuildReceiptAsset,
    'runtime-payload-3.8.5.tar.gz',
    'runtime-payload-3.8.5.tar.gz.sha256',
    sourceAsset,
    sourceChecksumAsset,
    cadHostSourceAsset,
    `${cadHostSourceAsset}.sha256`,
    bimSourceAsset,
    `${bimSourceAsset}.sha256`,
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
  if (verifiedRelease.headCommit !== publishedSourceCommit) throw new Error('v3.8.5 maintenance must finish the existing draft, not create another release')
  if (existing) throw new Error(`${tag} already exists; published versions are immutable`)
  const response = await fetch(`${apiRoot}/releases`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      tag_name: tag,
      name: 'Agent Pi DSH 3.8.5',
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
  await assertRemoteReleaseCommit()
  const response = await fetch(`${apiRoot}/releases/${release.id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({
      name: 'Agent Pi DSH 3.8.5',
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
