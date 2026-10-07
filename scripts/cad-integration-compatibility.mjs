import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// These are the CAD compilation, toolchain and runtime integration inputs.
// Packaging and publication scripts transport an already verified CAD runtime;
// their changes do not change the original CAD build or its corresponding source.
export const CAD_INPUT_PATHS = Object.freeze([
  'LICENSE',
  'package.json',
  'THIRD_PARTY_NOTICES.md',
  'tools/mlightcad-poc',
  'bundles/tender-host/src/cad-viewer-assets.ts',
  'bundles/tender-host/src/http.ts',
  'bundles/tender-web/src/client/file-preview-overlay.js',
  'bundles/tender-web/src/client/styles.js',
  'scripts/cad-clean-builder.Dockerfile',
  'scripts/cad-clean-pins.json',
  'scripts/cad-clean-release.mjs',
  'scripts/build-cad-clean-release.sh',
  'docs/cad-clean-source.md',
  'docs/cad-clean-third-party.md',
  '.github/workflows/build-cad-clean-source.yml',
])

// Reviewed 3.7.1 additions are confined to project-plan preview and model settings.
// Exact file pairs keep every CAD route/asset change blocked until separately reviewed.
const reviewed371 = {
  "bundles/tender-host/src/http.ts": [
    "e93ed84a6d37dacd33f965828c59d466d80590f0e307a36783ff367b2ba77c80",
    "b08f769e7ab5e0643f77868308a791f149187c82cfdd83416fc17a87af97651b"
  ],
  "bundles/tender-web/src/client/file-preview-overlay.js": [
    "49ed4551ed5c04265b0b316acd565ab42dacc9fd325f2cba5da068c136d7439a",
    "375e8e3620c0589841a33f3ea78954d14d9edd240c7409471c3b815a06fd578d"
  ]
}
// Reviewed 3.7.5 pairs include native workbench/task capability wiring, project-plan
// preview and logical file-rail layout. CAD iframe, routes and CAD-specific styles
// remain unchanged. Accept these exact bytes only; further edits require review.
const reviewed375 = {
  "bundles/tender-host/src/http.ts": [
    "e93ed84a6d37dacd33f965828c59d466d80590f0e307a36783ff367b2ba77c80",
    "54568ace9028ad8f88a159a115e90fa5fa25e04dbedcf68e54e31f66a4b61de5"
  ],
  "bundles/tender-web/src/client/file-preview-overlay.js": [
    "49ed4551ed5c04265b0b316acd565ab42dacc9fd325f2cba5da068c136d7439a",
    "f6894a287956ba954255dde3e4a40bc1576670ccd7222801ce2f1ff80326346a"
  ],
  "bundles/tender-web/src/client/styles.js": [
    "c1784d427a0c8ae2df46ccc6c6fb4504dcabcc0668d56a5a32d13af775defd19",
    "55977fc3b1a5a32cd2398c3ef577bf6e336fa18417839613fc6d74766ff89567"
  ]
}
function reviewedNonCadPair(path, before, after) {
  return [reviewed371[path], reviewed375[path]].some((pair) => pair &&
    [before, after].every((text, index) => createHash('sha256').update(text).digest('hex') === pair[index]))
}

// The 3.8.0 host added DWG-to-DXF conversion using the existing clean-built
// LibreDWG worker. This is a reviewed CAD host extension, not a non-CAD change.
// Native viewer inputs remain unchanged. Pin the entire reviewed integration
// and dependency closure; any later edit requires another explicit review.
const reviewed381HostExtension = {
  shared: {
    'package.json': [
      'c81d6358654bd40d0f348c08f4f75d3489e7d59dbe70ddd2bbdc7212bbf8f850',
      '30d41c1b665ea0edf5a4352644efa39c7a3aad442c035af73bbfbbc656d2ca51',
    ],
    'bundles/tender-host/src/http.ts': [
      'e93ed84a6d37dacd33f965828c59d466d80590f0e307a36783ff367b2ba77c80',
      '0c34811f56fd41a25f70b33f0ad51cfda4abab102e1e12cb0e1e9d7a79e1539b',
    ],
    'bundles/tender-web/src/client/file-preview-overlay.js': [
      '49ed4551ed5c04265b0b316acd565ab42dacc9fd325f2cba5da068c136d7439a',
      '87e47703a9fdb44d199b6f992bb9a54dde03a0c21c2f7568fa16b9b0617306d6',
    ],
  },
  files: {
    'bundles/tender-host/src/cad-convert.ts': '3d570a2cc7358bdf0d2ba7ec101ee4f405e034b3f46f7c386fd55dfc386e465b',
    'bundles/tender-host/src/cad-convert-worker.mjs': '038872675b5a63b27411a217422a5bd0f8ab71eb789b3d9d89b07f65fd10affc',
    'bundles/tender-host/package.json': '8095218e5fd0666c7b155c514649bed0c17554ac0a9fc338cc7f75792e92ac55',
    'bundles/tender-host/package-lock.json': '225b171ab05af68c8581180880cc5ed3aee5e21250ab70f9a0cfdee3c7840ead',
  },
}

function reviewedHash(path, text) {
  if (path === 'package.json') text = text.replace(/("version"\s*:\s*")[^"]+"/, '$1<application-version>"')
  return createHash('sha256').update(text).digest('hex')
}

function reviewedHostPair(path, before, after) {
  const pair = reviewed381HostExtension.shared[path]
  return pair && [before, after].every((text, index) => reviewedHash(path, text) === pair[index])
}

function verifyReviewedHostExtension(root, sourceCommit, target) {
  for (const path of Object.keys(reviewed381HostExtension.shared)) {
    const before = git(root, ['show', `${sourceCommit}:${path}`])
    const after = git(root, ['show', `${target}:${path}`])
    if (!reviewedHostPair(path, before, after)) fail(`reviewed CAD host extension differs: ${path}`)
  }
  for (const [path, hash] of Object.entries(reviewed381HostExtension.files)) {
    const entry = git(root, ['ls-tree', target, '--', path]).trim()
    if (!entry.startsWith('100644 blob ')) fail(`reviewed CAD host extension missing or mode changed: ${path}`)
    if (reviewedHash(path, git(root, ['show', `${target}:${path}`])) !== hash) {
      fail(`reviewed CAD host extension differs: ${path}`)
    }
  }
  return {
    review: '3.8.1-host-dwg-conversion',
    nativeViewerBuildInputsUnchanged: true,
    sharedFileHashes: reviewed381HostExtension.shared,
    additionalFileHashes: reviewed381HostExtension.files,
  }
}

function fail(message) {
  throw new Error(`CAD integration compatibility: ${message}`)
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    fail(`git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`)
  }
}

function inputTree(root, commit) {
  const records = git(root, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', ...CAD_INPUT_PATHS])
    .split('\0').filter(Boolean).map((record) => {
      const separator = record.indexOf('\t')
      return [record.slice(separator + 1), record.slice(0, separator)]
    })
  const entries = new Map(records)
  for (const path of CAD_INPUT_PATHS) {
    if (![...entries.keys()].some((entry) => entry === path || entry.startsWith(`${path}/`))) {
      fail(`required CAD input is missing at ${commit}: ${path}`)
    }
  }
  return entries
}

function noticesOutsideNonCadSections(text) {
  const section = /^## (?:Optional )?dsh-univer-office integration\r?\n(?:(?!^## )[\s\S])*/gm
  if ([...text.matchAll(section)].length !== 1) return null
  const report = /^## huashu-report\r?\n(?:(?!^## )[\s\S])*/gm
  if ([...text.matchAll(report)].length > 1) return null
  const plans = /^## Local project plan engine \(MPXJ\)\r?\n(?:(?!^## )[\s\S])*/gm
  if ([...text.matchAll(plans)].length > 1) return null
  const officeRuntime = /^## Official DSH Office runtime\r?\n(?:(?!^## )[\s\S])*/gm
  if ([...text.matchAll(officeRuntime)].length > 1) return null
  return text.replace(section, '').replace(report, '')
    .replace(plans, '').replace(officeRuntime, '').trimEnd()
    .replace('`@dsh-external/dsh-super-injector` 0.3.5', '`@dsh-external/dsh-super-injector` 0.3.3')
    .replace('upstream `v0.3.5` release', 'upstream `v0.3.3` release')
    .replace('dsh-super-injector/tree/v0.3.5', 'dsh-super-injector/tree/v0.3.3')
    .replace('735c212b136e3fb3f9769e1f07266cd091570a55', 'f4ef59fb31439225abefe45d6e793235a2a9d5e0')
    .replace('49dc9c868704da0e73658976b37b55050bfefa8c22be5606dc290cdb77906f41', '355238fa8e51bc45c0801066af51e0e122f3b21411b193f601ee54e534391f48')
    .replace('\x60@dsh-external/dsh-super-injector\x60 0.3.3', '\x60@dsh-external/dsh-super-injector\x60 0.3.1')
    .replace('upstream \x60v0.3.3\x60 release', 'upstream \x60v0.3.1\x60 release')
    .replace('dsh-super-injector/tree/v0.3.3', 'dsh-super-injector/tree/v0.3.1')
    .replace('f4ef59fb31439225abefe45d6e793235a2a9d5e0', '8b4099535976d1af85137ef9e93815cf14c3f094')
    .replace('355238fa8e51bc45c0801066af51e0e122f3b21411b193f601ee54e534391f48', '1dfa8623b09684343843150600c4a9c58f2da1d9d0edfff7134a24091c99db4e')
}

// Normalize only reviewed studio identity and Office URL changes in shared files.
// Every other byte (including CAD routes, styles and file modes) stays pinned.
function withReviewedNonCadChanges(path, text) {
  if (path === 'bundles/tender-web/src/client/file-preview-overlay.js') {
    return "import { scopeUniverViewerUrl } from './univer-viewer-url.js'\n\n" + text
      .replace("      } else if (isUniver) {\n        body = h('iframe', {", "      } else if (isUniver) {\n        const viewerUrl = scopeUniverViewerUrl(office.viewerUrl, attachSessionId(props.sessionProps || props))\n        body = viewerUrl ? h('iframe', {")
      .replace('          src: office.viewerUrl,', '          src: viewerUrl,')
      .replace("          allow: 'clipboard-read; clipboard-write; fullscreen',\n        })", "          allow: 'clipboard-read; clipboard-write; fullscreen',\n        }) : h('div', { className: 'ap-doc-status' }, tAp('请先打开或创建一个对话，再预览 Office 文件。', 'Open or create a conversation before previewing Office files.'))")
  }
  if (path === 'bundles/tender-host/src/http.ts') {
    return text.replace("  'company.png': 'image/png',\n  'company-mark.png': 'image/png',\n", '')
      .replace("  'logo.png': 'image/png',", "  'logo.png': 'image/png',\n  'studio.png': 'image/png',")
  }
  if (path !== 'bundles/tender-web/src/client/styles.js') return text
  return text
    .replace('.ap-pi.rail{', '.ap-pi.rail,[data-sidebar-collapsed] .ap-pi{')
    .replace('.ap-pi.rail img{', '.ap-pi.rail img,[data-sidebar-collapsed] .ap-pi img{')
    .replace('.ap-pi img{display:block;width:100%;max-width:140px;height:auto;max-height:100px;object-fit:contain;object-position:center;user-select:none;pointer-events:none}', '.ap-pi img{display:block;width:112px;max-width:100%;height:112px;max-height:112px;border-radius:50%;object-fit:contain;object-position:center;user-select:none;pointer-events:none}')
    .replace('.ap-nav-host,.ap-company,.ap-pi{width:100%;flex:none}', '.ap-nav-host,.ap-studio,.ap-pi{width:100%;flex:none}')
    .replace('.ap-company{display:flex;align-items:center;justify-content:center;padding:4px 2px 10px}\n.ap-company img{display:block;width:100%;height:auto;max-height:34px;object-fit:contain;object-position:center;user-select:none}', '.ap-studio{text-align:center;padding:4px 2px 10px;font-size:11px;color:var(--dsw-alias-label-secondary)}')
    .replace('[data-sidebar-collapsed] #ap-mount-company{display:none}', '[data-sidebar-collapsed] #ap-mount-studio{display:none}')
    .replace('[data-phase="hero"]::before,\n[data-phase="active"]::before,\n[data-phase="settling"]::before{\n  content:"";display:block;flex:none;box-sizing:border-box;\n  height:44px;margin:8px 24px 2px;pointer-events:none;\n  background:url("/api/agent-pi/brand/company.png?v=5") center / contain no-repeat;\n}\n', '')
}

// Call after verifyCadCleanRelease: this supplements, never replaces, archive,
// source, toolchain, evidence and runtime hash verification.
export function assertCadIntegrationUnchanged({ root, manifest, releaseCommit = 'HEAD' }) {
  root = resolve(root)
  const source = manifest?.sources?.agentPiDshCadIntegration
  if (!/^[a-f0-9]{40}$/.test(source?.commit || '') || !/^[a-f0-9]{40}$/.test(source?.tree || '')) {
    fail('manifest must retain a full original CAD source commit and tree')
  }
  if (manifest.schema !== 'agent-pi-dsh/cad-clean-build/v1') fail('unsupported CAD manifest schema')
  if (git(root, ['rev-parse', '--verify', `${source.commit}^{commit}`]).trim() !== source.commit) {
    fail('original CAD source commit must identify a commit object')
  }
  const sourceTree = git(root, ['rev-parse', '--verify', `${source.commit}^{tree}`]).trim()
  if (sourceTree !== source.tree) fail('original CAD source commit does not match its recorded tree')
  const target = git(root, ['rev-parse', '--verify', '--end-of-options', `${releaseCommit}^{commit}`]).trim()
  const originalPackage = git(root, ['show', `${source.commit}:package.json`])
  const pkg = JSON.parse(originalPackage)
  if (manifest.releaseVersion !== pkg.version || source.tag !== `v${pkg.version}`) {
    fail('original CAD release version/tag does not match the original package')
  }
  const original = inputTree(root, source.commit)
  const current = inputTree(root, target)
  let usesReviewedHostExtension = false
  const changed = [...new Set([...original.keys(), ...current.keys()])]
    .filter((path) => {
      if (original.get(path) === current.get(path)) return false
      if (reviewed381HostExtension.shared[path]
          && original.get(path)?.split(' ').slice(0, 2).join(' ') === current.get(path)?.split(' ').slice(0, 2).join(' ')
          && reviewedHostPair(path, git(root, ['show', `${source.commit}:${path}`]), git(root, ['show', `${target}:${path}`]))) {
        usesReviewedHostExtension = true
        return false
      }
      // Only the application version may differ. Preserve the original CAD
      // release identity and compare every other byte, including dependencies.
      if (path === 'package.json'
          && original.get(path)?.split(' ').slice(0, 2).join(' ') === current.get(path)?.split(' ').slice(0, 2).join(' ')) {
        const after = git(root, ['show', `${target}:package.json`])
        if (JSON.parse(after).version !== pkg.version
            && after.replace(/("version"\s*:\s*")[^"]+"/, `$1${pkg.version}"`) === originalPackage) return false
      }
      // Office and report-skill notices do not enter the CAD build. Other notices and the
      // file's mode/type remain bound to the original corresponding source.
      if (path === 'THIRD_PARTY_NOTICES.md'
          && original.get(path)?.split(' ').slice(0, 2).join(' ') === current.get(path)?.split(' ').slice(0, 2).join(' ')) {
        const before = noticesOutsideNonCadSections(git(root, ['show', `${source.commit}:${path}`]))
        const after = noticesOutsideNonCadSections(git(root, ['show', `${target}:${path}`]))
        if (before !== null && before === after) return false
      }
      if (['bundles/tender-host/src/http.ts', 'bundles/tender-web/src/client/styles.js', 'bundles/tender-web/src/client/file-preview-overlay.js'].includes(path)
          && original.get(path)?.split(' ').slice(0, 2).join(' ') === current.get(path)?.split(' ').slice(0, 2).join(' ')) {
        const before = git(root, ['show', `${source.commit}:${path}`])
        const after = git(root, ['show', `${target}:${path}`])
        if (withReviewedNonCadChanges(path, before) === after || reviewedNonCadPair(path, before, after)) return false
      }
      return true
    })
  if (changed.length > 0) fail(`CAD inputs changed since ${source.commit}: ${changed.join(', ')}`)
  const converterPaths = Object.keys(reviewed381HostExtension.files).filter(path => path.startsWith('bundles/tender-host/src/'))
  const hasHostConverter = git(root, ['ls-tree', target, '--', ...converterPaths]).trim().length > 0
  const hostExtension = usesReviewedHostExtension || hasHostConverter ? verifyReviewedHostExtension(root, source.commit, target) : undefined
  const inputPaths = [...CAD_INPUT_PATHS, ...(hostExtension ? Object.keys(reviewed381HostExtension.files) : [])]
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...inputPaths, ...converterPaths]).trim()) {
    fail('CAD inputs have uncommitted changes')
  }
  return { sourceCommit: source.commit, sourceTree, releaseCommit: target, inputPaths, ...(hostExtension ? { hostExtension } : {}) }
}

export function main(args = process.argv.slice(2)) {
  const options = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    if (!['--root', '--manifest', '--release-commit'].includes(key) || !args[index + 1] || options.has(key)) {
      fail('usage: cad-integration-compatibility.mjs --root <checkout> --manifest <CAD-CLEAN-BUILD.json> [--release-commit <ref>]')
    }
    options.set(key, args[index + 1])
  }
  if (!options.has('--root') || !options.has('--manifest')) fail('--root and --manifest are required')
  const result = assertCadIntegrationUnchanged({
    root: options.get('--root'),
    manifest: JSON.parse(readFileSync(resolve(options.get('--manifest')), 'utf8')),
    releaseCommit: options.get('--release-commit') || 'HEAD',
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
