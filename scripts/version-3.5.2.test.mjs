import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(...parts) {
  return JSON.parse(readFileSync(join(root, ...parts), 'utf8'))
}

function readText(...parts) {
  return readFileSync(join(root, ...parts), 'utf8')
}

test('release manifests resolve to Agent Pi DSH 3.5.2', () => {
  const rootPackage = readJson('package.json')
  const desktopPackage = readJson('apps', 'desktop', 'package.json')
  const desktopLock = readJson('apps', 'desktop', 'package-lock.json')
  const compactionPackage = readJson('bundles', 'agent-pi-compaction', 'package.json')

  assert.equal(rootPackage.version, '3.5.2')
  assert.equal(desktopPackage.version, '3.5.2')
  assert.equal(desktopLock.version, '3.5.2')
  assert.equal(desktopLock.packages[''].version, '3.5.2')
  assert.equal(compactionPackage.version, '3.5.2')

  const codexModels = readText('apps', 'desktop', 'codex-models.mjs')
  assert.match(codexModels, /clientInfo: \{ name: 'agent-pi-dsh', version: '3\.5\.2' \}/)

  const website = readText('website', 'index.html')
  const websiteDocs = readText('website', 'docs.html')
  assert.match(website, /data-rel-version>v3\.5\.2</)
  assert.match(website, /Agent-Pi-DSH-3\.5\.2-x64\.exe/)
  assert.match(website, /执行账本 · 双态控制面板/)
  assert.match(websiteDocs, /3\.5\.1 执行账本与双态控制/)
  assert.match(websiteDocs, /data-release-version>3\.5\.2</)
})

test('public website exposes three-platform 3.5.2 fallback and syncs only a complete GitHub latest release', () => {
  const website = readText('website', 'index.html')
  const releaseScript = readText('website', 'assets', 'js', 'main.js')
  const privacy = readText('website', 'privacy-policy.html')
  const fallbackAssets = [
    'Agent-Pi-DSH-3.5.2-x64.exe',
    'Agent-Pi-DSH-3.5.2-x64.exe.sha256',
    'Agent-Pi-DSH-3.5.2-mac-arm64.dmg',
    'Agent-Pi-DSH-3.5.2-mac-arm64.zip',
    'Agent-Pi-DSH-3.5.2-linux-x86_64.AppImage',
    'Agent-Pi-DSH-3.5.2-linux-amd64.deb',
  ]

  for (const asset of fallbackAssets) assert.match(website, new RegExp(asset.replaceAll('.', '\\.')))
  assert.match(website, /data-release-platform="windows"/)
  assert.match(website, /data-release-platform="macos"/)
  assert.match(website, /data-release-platform="linux"/)
  assert.match(releaseScript, /releases\/latest/)
  assert.match(releaseScript, /!assets\["windows-exe"\] \|\| !assets\["mac-dmg"\] \|\| !assets\["linux-appimage"\]/)
  assert.match(releaseScript, /\.digest \|\| ""/)
  assert.match(releaseScript, /data-release-state", "synced"/)
  assert.match(privacy, /GitHub(?: 的公开|'s public) Latest Release API/)
})

test('release upload paths are immutable and cross-platform builds run from the release tag', () => {
  const publish = readText('scripts', 'publish-win-and-trigger-platforms.ps1')
  const workflow = readText('.github', 'workflows', 'build-desktop-assets.yml')
  const createRelease = readText('release', 'publish-v3.5.2-release.mjs')
  assert.doesNotMatch(publish, /--clobber/)
  assert.doesNotMatch(workflow, /--clobber/)
  assert.match(publish, /workflow run build-desktop-assets\.yml --repo \$Repo --ref \$Tag/)
  assert.match(publish, /InstallerChecksum/)
  assert.match(workflow, /GITHUB_REF_TYPE.*tag/)
  assert.match(workflow, /GITHUB_REF_NAME.*inputs\.tag/)
  assert.match(createRelease, /git\/ref\/tags/)
  assert.match(createRelease, /compare\/\$\{tagCommit\}\.\.\.main/)
  assert.doesNotMatch(createRelease, /target_commitish/)
})
