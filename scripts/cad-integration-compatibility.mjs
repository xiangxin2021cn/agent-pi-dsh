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

function noticesOutsideOffice(text) {
  const section = /^## (?:Optional )?dsh-univer-office integration\r?\n(?:(?!^## )[\s\S])*/gm
  if ([...text.matchAll(section)].length !== 1) return null
  return text.replace(section, '')
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
  const pkg = JSON.parse(git(root, ['show', `${target}:package.json`]))
  if (manifest.releaseVersion !== pkg.version || source.tag !== `v${pkg.version}`) {
    fail('original CAD release version/tag does not match the release package')
  }
  const original = inputTree(root, source.commit)
  const current = inputTree(root, target)
  const changed = [...new Set([...original.keys(), ...current.keys()])]
    .filter((path) => {
      if (original.get(path) === current.get(path)) return false
      // Office notices do not enter the CAD build. All other notices and the
      // file's mode/type remain bound to the original corresponding source.
      if (path === 'THIRD_PARTY_NOTICES.md'
          && original.get(path)?.split(' ').slice(0, 2).join(' ') === current.get(path)?.split(' ').slice(0, 2).join(' ')) {
        const before = noticesOutsideOffice(git(root, ['show', `${source.commit}:${path}`]))
        const after = noticesOutsideOffice(git(root, ['show', `${target}:${path}`]))
        if (before !== null && before === after) return false
      }
      return true
    })
  if (changed.length > 0) fail(`CAD inputs changed since ${source.commit}: ${changed.join(', ')}`)
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...CAD_INPUT_PATHS]).trim()) {
    fail('CAD inputs have uncommitted changes')
  }
  return { sourceCommit: source.commit, sourceTree, releaseCommit: target, inputPaths: [...CAD_INPUT_PATHS] }
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
