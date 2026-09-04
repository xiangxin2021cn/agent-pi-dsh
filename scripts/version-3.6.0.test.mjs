import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

test('3.6.0 source manifests are ready while the public website fallback stays on the existing release', () => {
  const rootPackage = readJson('package.json')
  const desktopPackage = readJson('apps', 'desktop', 'package.json')
  const desktopLock = readJson('apps', 'desktop', 'package-lock.json')
  const compactionPackage = readJson('bundles', 'agent-pi-compaction', 'package.json')

  assert.equal(rootPackage.version, '3.6.0')
  assert.equal(desktopPackage.version, '3.6.0')
  assert.equal(desktopLock.version, '3.6.0')
  assert.equal(desktopLock.packages[''].version, '3.6.0')
  assert.equal(compactionPackage.version, '3.6.0')

  const codexModels = readText('apps', 'desktop', 'codex-models.mjs')
  assert.match(codexModels, /clientInfo: \{ name: 'agent-pi-dsh', version: '3\.6\.0' \}/)

  const localNotes = readText('release', 'notes-3.6.0.md')
  assert.match(localNotes, /正式版/)
  assert.match(localNotes, /GPL-3\.0-only/)
  assert.equal(existsSync(join(root, 'release', 'publish-v3.6.0-release.mjs')), true)

  const readme = readText('README.md')
  assert.match(readme, /releases\/download\/v3\.6\.0\/Agent-Pi-DSH-3\.6\.0-x64\.exe/)
  assert.match(readme, /dsh-v0\.1\.2-rc\.1/)
  assert.match(readme, /正式 SHA256 以同一 Release 中的 `\.sha256` 资产为准/)
  assert.doesNotMatch(readme, /releases\/download\/v3\.5\.2/)

  const website = readText('website', 'index.html')
  const websiteDocs = readText('website', 'docs.html')
  const signingPolicy = readText('website', 'code-signing-policy.html')
  assert.match(website, /data-rel-version>v3\.5\.3</)
  assert.match(website, /Agent-Pi-DSH-3\.5\.3-x64\.exe/)
  assert.match(website, /执行账本 · 双态控制面板/)
  assert.match(websiteDocs, /3\.5\.1 执行账本与双态控制/)
  assert.match(websiteDocs, /data-release-version>3\.5\.3</)
  assert.match(websiteDocs, /data-kernel-version>dsh-v0\.1\.2-alpha\.3</)
  assert.match(websiteDocs, /data-kernel-pin[^>]*>dd6322d604</)
  assert.match(signingPolicy, /data-release-version>3\.5\.3</)
})

test('public website exposes the current three-platform fallback and syncs only a complete GitHub latest release', () => {
  const website = readText('website', 'index.html')
  const releaseScript = readText('website', 'assets', 'js', 'main.js')
  const privacy = readText('website', 'privacy-policy.html')
  const fallbackAssets = [
    'Agent-Pi-DSH-3.5.3-x64.exe',
    'Agent-Pi-DSH-3.5.3-x64.exe.sha256',
    'Agent-Pi-DSH-3.5.3-mac-arm64.dmg',
    'Agent-Pi-DSH-3.5.3-mac-arm64.zip',
    'Agent-Pi-DSH-3.5.3-linux-x86_64.AppImage',
    'Agent-Pi-DSH-3.5.3-linux-amd64.deb',
  ]

  for (const asset of fallbackAssets) assert.match(website, new RegExp(asset.replaceAll('.', '\\.')))
  assert.match(website, /data-release-platform="windows"/)
  assert.match(website, /data-release-platform="macos"/)
  assert.match(website, /data-release-platform="linux"/)
  assert.match(releaseScript, /releases\/latest/)
  assert.match(website, /data-kernel-version>dsh-v0\.1\.2-alpha\.3</)
  assert.match(website, /data-release-sha data-release-sha-source="github-release">579CAE929C685CB0BAD65F6476B4124593DD3649C68CCAE0E1CA8829E8EF7213</)
  assert.match(releaseScript, /AgentPiReleaseMetadata\.releaseIdentity\(release\)/)
  assert.match(releaseScript, /querySelectorAll\("\[data-kernel-version\]"\)/)
  assert.match(releaseScript, /data-release-sha-source", "github-release"/)
  assert.match(releaseScript, /!assets\["windows-exe"\] \|\| !assets\["mac-dmg"\] \|\| !assets\["linux-appimage"\]/)
  assert.match(releaseScript, /\.digest \|\| ""/)
  assert.match(releaseScript, /data-release-state", "synced"/)
  assert.match(privacy, /GitHub(?: 的公开|'s public) Latest Release API/)
})

test('3.6.0 publisher remains immutable and fails closed before GitHub access until the GPL release inputs verify', () => {
  const publish = readText('scripts', 'publish-win-and-trigger-platforms.ps1')
  const workflow = readText('.github', 'workflows', 'build-desktop-assets.yml')
  const cadWorkflow = readText('.github', 'workflows', 'build-cad-clean-source.yml')
  const cadBuild = readText('scripts', 'build-cad-clean-release.sh')
  const cadPins = readJson('scripts', 'cad-clean-pins.json')
  const cadPackage = readJson('tools', 'mlightcad-poc', 'package.json')
  const cadLock = readJson('tools', 'mlightcad-poc', 'package-lock.json')
  const publisherPath = join(root, 'release', 'publish-v3.6.0-release.mjs')
  const createRelease = readFileSync(publisherPath, 'utf8')
  assert.doesNotMatch(publish, /--clobber/)
  assert.doesNotMatch(workflow, /--clobber/)
  assert.match(cadWorkflow, /include-hidden-files:\s*true/)
  assert.match(cadWorkflow, /git config --global --add safe\.directory \/workspace/)
  assert.match(cadWorkflow, /url\."https:\/\/github\.com\/zserge\/jsmn\.git"\.insteadOf https:\/\/github\.com\/zserge\/jsmn/)
  assert.match(cadWorkflow, /COREPACK_ENABLE_PROJECT_SPEC=0/)
  assert.equal(cadPins.builder.autoconfHostAlias, 'wasm32-unknown-emscripten')
  assert.match(cadBuild, /host_alias="\$\{AUTOCONF_HOST_ALIAS\}" pnpm run build:prepare/)
  assert.match(cadBuild, /core\.quotePath=false/)
  assert.match(cadBuild, /status --porcelain=v1 --untracked-files=all --ignore-submodules=all/)
  assert.match(cadBuild, /printf '%s\\n' "\$\{status\}" >&2/)
  assert.equal(
    cadBuild.match(/pnpm install --frozen-lockfile --store-dir "\$\{BUILD_ROOT\}\/pnpm-store"/g)?.length,
    2,
  )
  assert.equal(cadPackage.devDependencies['@types/node'], '22.16.0')
  assert.equal(cadLock.packages['node_modules/@types/node'].version, '22.16.0')
  assert.equal(cadLock.packages['node_modules/undici-types'].version, '6.21.0')
  assert.match(publish, /workflow run build-desktop-assets\.yml --repo \$Repo --ref \$Tag/)
  assert.match(publish, /InstallerChecksum/)
  assert.match(publish, /InstallerBuildReceipt/)
  assert.match(publish, /windows-build-receipt\.mjs"\) verify/)
  assert.match(publish, /\$UploadAssets \+= @\(\$InstallerBuildReceipt, \$CadSource, \$CadSourceChecksum\)/)
  assert.match(workflow, /GITHUB_REF_TYPE.*tag/)
  assert.match(workflow, /GITHUB_REF_NAME.*inputs\.tag/)
  assert.match(workflow, /runtime-payload-\$\{version\}\.tar\.gz\.sha256/)
  assert.match(workflow, /checksum_assets=\(\)/)
  assert.match(workflow, /\$\{asset\}\.sha256/)
  assert.match(createRelease, /git\/ref\/tags/)
  assert.match(createRelease, /releases\?per_page=100/)
  assert.match(createRelease, /remoteCommit !== localCommit/)
  assert.match(createRelease, /compare\/\$\{remoteCommit\}\.\.\.main/)
  assert.match(createRelease, /platformChecksumPairs/)
  assert.match(createRelease, /readUploadedChecksum/)
  assert.match(createRelease, /expected exactly \$\{requiredAssets\.size\} assets/)
  assert.doesNotMatch(createRelease, /target_commitish/)
  assert.match(createRelease, /GPL-3\.0-only/)
  assert.match(createRelease, /assertReleaseCheckout/)
  assert.match(createRelease, /verifyCadCleanRelease/)
  assert.match(createRelease, /verifyWindowsBuildReceipt/)
  assert.match(createRelease, /Agent-Pi-DSH-3\.6\.0-x64\.exe\.build\.json/)
  assert.match(createRelease, /Agent-Pi-DSH-3\.6\.0-CAD-corresponding-source\.tar\.gz/)
  assert.match(createRelease, /Agent-Pi-DSH-3\.6\.0-CAD-corresponding-source\.tar\.gz\.sha256/)
  assert.match(createRelease, /existsSync/)
  assert.match(createRelease, /createHash\('sha256'\)/)
  assert.ok(
    createRelease.indexOf('await assertCadDistributionReady()') < createRelease.indexOf("execSync('gh auth token'"),
    'release-input gate must run before GitHub authentication',
  )

  const blocked = spawnSync(process.execPath, [publisherPath, '--create-draft'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.notEqual(blocked.status, 0)
  assert.match(
    `${blocked.stdout}\n${blocked.stderr}`,
    /publishing requires a completely clean checkout|exact v3\.6\.0 tag|no tag exactly matches|release checksum pair is incomplete/i,
  )
})
