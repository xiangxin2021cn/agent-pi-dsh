#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultPinsPath = join(root, 'scripts', 'cad-clean-pins.json')
const manifestName = 'SOURCE-MANIFEST.json'
const inventoryName = 'SOURCE-FILES.sha256'
const minimumWasmBytes = 1024 * 1024
const gitEvidenceFiles = new Set([
  '.agent-pi-git-commit.txt',
  '.agent-pi-git-tag.txt',
  '.agent-pi-full-git-tree.txt',
])

function fail(message) {
  throw new Error(`CAD clean release: ${message}`)
}

function readJson(path, label = path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`cannot read ${label}: ${error.message}`)
  }
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path))
}

function gitObjectHash(type, bytes) {
  const header = Buffer.from(`${type} ${bytes.length}\0`)
  return createHash('sha1').update(header).update(bytes).digest('hex')
}

function toArchivePath(rootPath, path) {
  return relative(rootPath, path).split(sep).join('/')
}

function listFiles(directory, { excluded = new Set() } = {}) {
  const base = resolve(directory)
  const files = []
  const pending = [base]

  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      const name = toArchivePath(base, path)
      if (excluded.has(name)) continue
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) fail(`symbolic links are not allowed in the source archive: ${name}`)
      if (stat.isDirectory()) pending.push(path)
      else if (stat.isFile()) files.push(path)
      else fail(`unsupported source archive entry: ${name}`)
    }
  }

  return files.sort((left, right) => toArchivePath(base, left).localeCompare(toArchivePath(base, right)))
}

function fileRecord(rootPath, path) {
  return {
    path: toArchivePath(rootPath, path),
    bytes: statSync(path).size,
    sha256: sha256File(path),
  }
}

function assertExact(actual, expected, label) {
  try {
    assert.deepEqual(actual, expected)
  } catch {
    fail(`${label} does not match the pinned value`)
  }
}

function assertHex(value, length, label) {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    fail(`${label} must be ${length} lowercase hexadecimal characters`)
  }
}

function loadPins(path = defaultPinsPath) {
  const pins = readJson(path, 'CAD source pins')
  if (pins.schema !== 'agent-pi-dsh/cad-clean-pins/v1') fail('unsupported pins schema')
  const allSources = [
    ['LibreDWG Web', pins.sources.libredwgWeb],
    ['jsmn', pins.sources.jsmn],
    ['RealDWG Web', pins.sources.realdwgWeb],
    ['CAD Viewer', pins.sources.cadViewer],
    ['MText Renderer', pins.sources.mtextRenderer],
    ['MText Parser', pins.sources.mtextParser],
    ['SHX Parser', pins.sources.shxParser],
  ]
  for (const [label, source] of allSources) {
    assertHex(source.commit, 40, `${label} commit`)
    assertHex(source.tree, 40, `${label} tree`)
  }
  for (const [label, source] of [
    ['LibreDWG Web', pins.sources.libredwgWeb],
    ['RealDWG Web', pins.sources.realdwgWeb],
    ['CAD Viewer', pins.sources.cadViewer],
    ['MText Renderer', pins.sources.mtextRenderer],
    ['MText Parser', pins.sources.mtextParser],
    ['SHX Parser', pins.sources.shxParser],
  ]) {
    assertHex(source.tagObject, 40, `${label} tag object`)
  }
  if (!Array.isArray(pins.runtimeSourcePackages) || pins.runtimeSourcePackages.length === 0) {
    fail('runtime source package map is empty')
  }
  const runtimeNames = new Set()
  for (const entry of pins.runtimeSourcePackages) {
    if (!entry?.name || !entry.version || !entry.license || !entry.source || entry.source.split('/').includes('..')) {
      fail('runtime source package map contains an invalid entry')
    }
    if (runtimeNames.has(entry.name)) fail(`runtime source package map repeats ${entry.name}`)
    runtimeNames.add(entry.name)
  }
  for (const [label, source] of [
    ['LibreDWG Web', pins.sources.libredwgWeb],
    ['RealDWG Web', pins.sources.realdwgWeb],
  ]) {
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(source.npmIntegrity)) {
      fail(`${label} npm integrity must be a complete sha512 SRI value`)
    }
  }
  if (!pins.builder.baseImage.includes('@sha256:')) fail('builder base image must be digest-pinned')
  return pins
}

function assertSourceMarker(path, expected, label) {
  const marker = readJson(path, `${label} source marker`)
  assertExact(marker, expected, `${label} source marker`)
}

function parseGitTreeManifest(path) {
  const records = []
  for (const line of readFileSync(path, 'utf8').trimEnd().split('\n')) {
    const match = line.match(/^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40})\t(.+)$/)
    if (!match || match[4].includes('\\') || match[4].split('/').includes('..')) {
      fail(`malformed Git tree manifest line in ${path}`)
    }
    records.push({ mode: match[1], type: match[2], sha1: match[3], path: match[4] })
  }
  if (records.length === 0) fail(`Git tree manifest is empty: ${path}`)
  return records
}

function computeGitTree(records) {
  const rootNode = new Map()
  for (const record of records) {
    const parts = record.path.split('/')
    let node = rootNode
    for (const part of parts.slice(0, -1)) {
      const current = node.get(part)
      if (current?.record) fail(`Git tree path collides with a file: ${record.path}`)
      if (!current) node.set(part, { children: new Map() })
      node = node.get(part).children
    }
    const name = parts.at(-1)
    if (node.has(name)) fail(`duplicate Git tree path: ${record.path}`)
    node.set(name, { record })
  }

  function hashTree(node) {
    const entries = [...node.entries()].map(([name, value]) => {
      if (value.children) {
        return { name, mode: '40000', sha1: hashTree(value.children), directory: true }
      }
      return { name, mode: value.record.mode, sha1: value.record.sha1, directory: false }
    })
    entries.sort((left, right) => Buffer.compare(
      Buffer.from(`${left.name}${left.directory ? '/' : '\0'}`),
      Buffer.from(`${right.name}${right.directory ? '/' : '\0'}`),
    ))
    const body = Buffer.concat(entries.flatMap((entry) => [
      Buffer.from(`${entry.mode} ${entry.name}\0`),
      Buffer.from(entry.sha1, 'hex'),
    ]))
    return gitObjectHash('tree', body)
  }

  return hashTree(rootNode)
}

function assertGitCommit(directory, expectedCommit, expectedTree, label) {
  const bytes = readFileSync(join(directory, '.agent-pi-git-commit.txt'))
  if (gitObjectHash('commit', bytes) !== expectedCommit) {
    fail(`${label} raw commit object does not hash to ${expectedCommit}`)
  }
  const tree = bytes.toString('utf8').match(/^tree ([a-f0-9]{40})$/m)?.[1]
  if (tree !== expectedTree) fail(`${label} commit does not bind the pinned tree`)
}

function assertGitTag(directory, expectedTagObject, expectedCommit, expectedTag, label) {
  const bytes = readFileSync(join(directory, '.agent-pi-git-tag.txt'))
  if (gitObjectHash('tag', bytes) !== expectedTagObject) {
    fail(`${label} raw tag object does not hash to ${expectedTagObject}`)
  }
  const text = bytes.toString('utf8')
  if (text.match(/^object ([a-f0-9]{40})$/m)?.[1] !== expectedCommit) {
    fail(`${label} tag does not bind the pinned commit`)
  }
  if (text.match(/^type (.+)$/m)?.[1] !== 'commit' || text.match(/^tag (.+)$/m)?.[1] !== expectedTag) {
    fail(`${label} tag object has the wrong type or name`)
  }
}

function assertGitTreeManifest(path, expectedTree, label) {
  if (computeGitTree(parseGitTreeManifest(path)) !== expectedTree) {
    fail(`${label} Git tree manifest does not hash to ${expectedTree}`)
  }
}

function assertGitSubset(partialPath, fullPath, label) {
  const full = new Map(parseGitTreeManifest(fullPath).map((record) => [record.path, record]))
  for (const record of parseGitTreeManifest(partialPath)) {
    const expected = full.get(record.path)
    if (!expected || !Object.keys(record).every((key) => record[key] === expected[key])) {
      fail(`${label} partial Git export is not bound to its full tree: ${record.path}`)
    }
  }
}

function assertGitExport(directory, expectedTree, { ignoredPrefixes = [], generatedFiles = [] } = {}) {
  const manifestPath = join(directory, '.agent-pi-git-tree.txt')
  const records = parseGitTreeManifest(manifestPath)
  for (const record of records) {
    if (record.type === 'commit') continue
    const file = join(directory, ...record.path.split('/'))
    let bytes
    try {
      bytes = readFileSync(file)
    } catch {
      fail(`Git source export is missing ${record.path}`)
    }
    if (gitObjectHash('blob', bytes) !== record.sha1) fail(`Git blob hash mismatch: ${record.path}`)
  }

  const ignored = new Set([
    '.agent-pi-source.json',
    '.agent-pi-git-tree.txt',
    ...gitEvidenceFiles,
    ...generatedFiles,
  ])
  const actual = listFiles(directory)
    .map((path) => toArchivePath(directory, path))
    .filter((path) => !ignored.has(path) && !ignoredPrefixes.some((prefix) => path.startsWith(prefix)))
  const expectedFiles = records
    .filter((record) => record.type === 'blob')
    .map((record) => record.path)
    .sort((left, right) => left.localeCompare(right))
  assertExact(actual, expectedFiles, `Git-exported files below ${directory}`)

  if (expectedTree && computeGitTree(records) !== expectedTree) {
    fail(`recomputed Git tree below ${directory} does not match ${expectedTree}`)
  }
  return records
}

function assertPackage(path, expectedName, expectedVersion, expectedLicense) {
  const manifest = readJson(path, `${expectedName} package manifest`)
  if (manifest.name !== expectedName) fail(`${path} has package name ${manifest.name || '<missing>'}`)
  if (manifest.version !== expectedVersion) fail(`${expectedName} has version ${manifest.version || '<missing>'}`)
  if (expectedLicense !== undefined && manifest.license !== expectedLicense) {
    fail(`${expectedName} must declare ${expectedLicense}`)
  }
}

function assertSourceTree(sourceRoot, pins, dshSource) {
  const libre = join(sourceRoot, 'libredwg-web')
  const real = join(sourceRoot, 'realdwg-web')
  const dsh = join(sourceRoot, 'agent-pi-dsh-cad-integration')
  const extraSources = [
    ['CAD Viewer', 'cad-viewer', pins.sources.cadViewer],
    ['MText Renderer', 'mtext-renderer', pins.sources.mtextRenderer],
    ['MText Parser', 'mtext-parser', pins.sources.mtextParser],
    ['SHX Parser', 'shx-parser', pins.sources.shxParser],
  ]

  assertSourceMarker(join(libre, '.agent-pi-source.json'), {
    repository: pins.sources.libredwgWeb.repository,
    tag: pins.sources.libredwgWeb.tag,
    tagObject: pins.sources.libredwgWeb.tagObject,
    commit: pins.sources.libredwgWeb.commit,
    tree: pins.sources.libredwgWeb.tree,
  }, 'LibreDWG Web')
  assertSourceMarker(join(libre, 'jsmn', '.agent-pi-source.json'), {
    repository: pins.sources.jsmn.repository,
    commit: pins.sources.jsmn.commit,
    tree: pins.sources.jsmn.tree,
  }, 'jsmn')
  assertSourceMarker(join(real, '.agent-pi-source.json'), {
    repository: pins.sources.realdwgWeb.repository,
    tag: pins.sources.realdwgWeb.tag,
    tagObject: pins.sources.realdwgWeb.tagObject,
    commit: pins.sources.realdwgWeb.commit,
    tree: pins.sources.realdwgWeb.tree,
  }, 'RealDWG Web')
  assertSourceMarker(join(dsh, '.agent-pi-source.json'), dshSource, 'Agent Pi DSH CAD integration')
  const libreRecords = assertGitExport(libre, pins.sources.libredwgWeb.tree, {
    ignoredPrefixes: ['jsmn/'],
    generatedFiles: ['.tarball-version'],
  })
  assertExact(
    libreRecords.find((record) => record.path === 'jsmn'),
    { mode: '160000', type: 'commit', sha1: pins.sources.jsmn.commit, path: 'jsmn' },
    'LibreDWG jsmn gitlink',
  )
  assertGitCommit(libre, pins.sources.libredwgWeb.commit, pins.sources.libredwgWeb.tree, 'LibreDWG Web')
  assertGitTag(
    libre,
    pins.sources.libredwgWeb.tagObject,
    pins.sources.libredwgWeb.commit,
    pins.sources.libredwgWeb.tag,
    'LibreDWG Web',
  )
  assertGitExport(join(libre, 'jsmn'), pins.sources.jsmn.tree)
  assertGitCommit(join(libre, 'jsmn'), pins.sources.jsmn.commit, pins.sources.jsmn.tree, 'jsmn')
  assertGitExport(real, pins.sources.realdwgWeb.tree)
  assertGitCommit(real, pins.sources.realdwgWeb.commit, pins.sources.realdwgWeb.tree, 'RealDWG Web')
  assertGitTag(
    real,
    pins.sources.realdwgWeb.tagObject,
    pins.sources.realdwgWeb.commit,
    pins.sources.realdwgWeb.tag,
    'RealDWG Web',
  )
  for (const [label, directory, source] of extraSources) {
    const path = join(sourceRoot, directory)
    assertSourceMarker(join(path, '.agent-pi-source.json'), {
      repository: source.repository,
      tag: source.tag,
      tagObject: source.tagObject,
      commit: source.commit,
      tree: source.tree,
    }, label)
    assertGitExport(path, source.tree)
    assertGitCommit(path, source.commit, source.tree, label)
    assertGitTag(path, source.tagObject, source.commit, source.tag, label)
  }
  assertGitExport(dsh, null)
  assertGitSubset(
    join(dsh, '.agent-pi-git-tree.txt'),
    join(dsh, '.agent-pi-full-git-tree.txt'),
    'Agent Pi DSH',
  )
  assertGitTreeManifest(join(dsh, '.agent-pi-full-git-tree.txt'), dshSource.tree, 'Agent Pi DSH')
  assertGitCommit(dsh, dshSource.commit, dshSource.tree, 'Agent Pi DSH')

  assertPackage(
    join(libre, 'bindings', 'javascript', 'package.json'),
    pins.sources.libredwgWeb.packageName,
    pins.sources.libredwgWeb.packageVersion,
    'GPL-3.0',
  )
  assertPackage(
    join(real, 'packages', 'libredwg-converter', 'package.json'),
    pins.sources.realdwgWeb.packageName,
    pins.sources.realdwgWeb.packageVersion,
    'GPL-3.0',
  )
  assertPackage(join(dsh, 'package.json'), 'agent-pi-dsh', pins.releaseVersion, undefined)
  assertPackage(join(dsh, 'tools', 'mlightcad-poc', 'package.json'), 'agent-pi-dsh-mlightcad-poc', '0.0.0', undefined)
  for (const entry of pins.runtimeSourcePackages) {
    assertPackage(join(sourceRoot, ...entry.source.split('/')), entry.name, entry.version, entry.license)
  }

  const tarballVersion = readFileSync(join(libre, '.tarball-version'), 'utf8').trim()
  if (tarballVersion !== pins.sources.libredwgWeb.packageVersion) {
    fail(`LibreDWG .tarball-version must be ${pins.sources.libredwgWeb.packageVersion}`)
  }
  const gpl = readFileSync(join(sourceRoot, 'LICENSES', 'GPL-3.0.txt'), 'utf8')
  if (!gpl.includes('GNU GENERAL PUBLIC LICENSE') || !gpl.includes('Version 3, 29 June 2007')) {
    fail('LICENSES/GPL-3.0.txt is not the GPLv3 license text')
  }
  const dshLicense = readFileSync(join(dsh, 'LICENSE'), 'utf8')
  if (!dshLicense.includes('GNU GENERAL PUBLIC LICENSE') || !dshLicense.includes('Version 3, 29 June 2007')) {
    fail('Agent Pi DSH integration must carry the release-root GPLv3 license')
  }
  for (const required of [
    join(libre, 'COPYING'),
    join(libre, 'jsmn', 'LICENSE'),
    join(real, 'LICENSE'),
    join(sourceRoot, 'BUILD-INSTRUCTIONS.md'),
    join(sourceRoot, 'THIRD-PARTY-SOURCES.md'),
    join(sourceRoot, 'toolchain-sources', 'mimalloc', 'LICENSE'),
    join(sourceRoot, 'toolchain-sources', 'zlib', 'LICENSE'),
    join(sourceRoot, 'toolchain-sources', 'emmalloc.c'),
    join(sourceRoot, 'toolchain-sources', 'emscripten-LICENSE'),
  ]) {
    try {
      if (!statSync(required).isFile()) fail(`required source or license file is not regular: ${required}`)
    } catch {
      fail(`required source or license file is missing: ${required}`)
    }
  }
}

function publishedNpmReferences(pins) {
  return {
    usedAsNativeBuildInput: false,
    purpose: 'Provenance comparison only; the clean native build uses the pinned Git exports.',
    packages: [
      {
        name: pins.sources.libredwgWeb.packageName,
        version: pins.sources.libredwgWeb.packageVersion,
        integrity: pins.sources.libredwgWeb.npmIntegrity,
      },
      {
        name: pins.sources.realdwgWeb.packageName,
        version: pins.sources.realdwgWeb.packageVersion,
        integrity: pins.sources.realdwgWeb.npmIntegrity,
      },
    ],
  }
}

function assertToolchain(toolchain, pins) {
  const expected = pins.builder
  for (const key of ['baseImage', 'emsdkVersion', 'emsdkCommit', 'emscriptenCommit', 'autoconfHostAlias', 'nodeVersion', 'pnpmVersion']) {
    if (toolchain[key] !== expected[key]) fail(`toolchain ${key} does not match the pin`)
  }
  if (typeof toolchain.builderImageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(toolchain.builderImageId)) {
    fail('builder image id must use a full sha256 digest')
  }
  if (!String(toolchain.emccVersion).includes(` ${expected.emsdkVersion}`)) {
    fail(`emcc version is not ${expected.emsdkVersion}`)
  }
  if (!toolchain.autoconfVersion || !toolchain.automakeVersion || !toolchain.libtoolVersion || !toolchain.makeVersion) {
    fail('autotools and make versions must be recorded')
  }
  if (!toolchain.aptPackages || typeof toolchain.aptPackages !== 'object') {
    fail('installed apt package versions must be recorded')
  }
}

function assertWasm(path, pins) {
  const bytes = readFileSync(path)
  if (bytes.length < minimumWasmBytes) fail(`LibreDWG wasm is too small: ${bytes.length} bytes`)
  if (!WebAssembly.validate(bytes)) fail('LibreDWG wasm does not validate')
  const latin = bytes.toString('latin1')
  if (latin.includes('_dirty') || latin.includes('0c9ab_dirty')) {
    fail('LibreDWG wasm contains a dirty-source version marker')
  }
  if (!latin.includes('LibreDWG ')) fail('LibreDWG wasm has no compiled version marker')
  if (sha256Bytes(bytes) === pins.sources.libredwgWeb.rejectedPublishedWasmSha256) {
    fail('LibreDWG wasm is the known upstream dirty-build binary')
  }
}

function assertWorker(path) {
  const worker = readFileSync(path, 'utf8')
  for (const marker of ['self.onmessage', 'postMessage', 'WebAssembly', 'libredwg-web.wasm']) {
    if (!worker.includes(marker)) fail(`parser worker is missing API marker ${marker}`)
  }
  if (worker.includes('data:application/wasm')) fail('parser worker inlines wasm instead of loading the sibling asset')
}

function inventoryRuntime(runtimeDir, pins) {
  const files = listFiles(runtimeDir, { excluded: new Set([pins.runtimeReceipt]) })
  const records = files.map((path) => fileRecord(runtimeDir, path))
  const paths = new Set(records.map((entry) => entry.path))
  for (const required of pins.requiredRuntimeArtifacts) {
    if (!paths.has(required)) fail(`clean runtime is missing ${required}`)
  }
  assertWasm(join(runtimeDir, 'workers', 'libredwg-web.wasm'), pins)
  assertWorker(join(runtimeDir, 'workers', 'libredwg-parser-worker.js'))
  return records
}

function writeSourceInventory(sourceRoot) {
  const excluded = new Set([manifestName, inventoryName])
  const records = listFiles(sourceRoot, { excluded }).map((path) => fileRecord(sourceRoot, path))
  const text = records.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n') + '\n'
  writeFileSync(join(sourceRoot, inventoryName), text)
  return { entries: records.length, sha256: sha256Bytes(Buffer.from(text)) }
}

function parseInventory(text) {
  const records = []
  let previous = ''
  for (const line of text.trimEnd().split('\n')) {
    const match = line.match(/^([a-f0-9]{64})  ([^\\]+)$/)
    if (!match) fail(`malformed ${inventoryName} line`)
    const path = match[2]
    if (path.startsWith('/') || path.split('/').includes('..')) fail(`unsafe inventory path: ${path}`)
    if (previous && path.localeCompare(previous) <= 0) fail(`${inventoryName} is not strictly sorted`)
    previous = path
    records.push({ sha256: match[1], path })
  }
  return records
}

function verifySourceInventory(sourceRoot, manifest) {
  const inventory = readFileSync(join(sourceRoot, inventoryName), 'utf8')
  if (sha256Bytes(Buffer.from(inventory)) !== manifest.sourceInventory.sha256) {
    fail(`${inventoryName} hash does not match the manifest`)
  }
  const records = parseInventory(inventory)
  if (records.length !== manifest.sourceInventory.entries) fail(`${inventoryName} entry count does not match the manifest`)

  const actualPaths = listFiles(sourceRoot, { excluded: new Set([manifestName, inventoryName]) })
    .map((path) => toArchivePath(sourceRoot, path))
  assertExact(actualPaths, records.map((entry) => entry.path), 'source archive file inventory')
  for (const record of records) {
    if (sha256File(join(sourceRoot, ...record.path.split('/'))) !== record.sha256) {
      fail(`source file hash mismatch: ${record.path}`)
    }
  }
}

function sourceMarker(repository, commit, tree, tag) {
  const marker = { repository }
  if (tag) marker.tag = tag
  marker.commit = commit
  marker.tree = tree
  return marker
}

function assertBuildEvidence(evidence, runtimeDir, pins) {
  if (evidence.schema !== 'agent-pi-dsh/cad-clean-evidence/v1') fail('unsupported clean-build evidence schema')
  const requiredChecks = new Map([
    ['libredwg-node-api', 'pnpm test'],
    ['realdwg-converter-build', "pnpm --filter @mlightcad/libredwg-converter... run build"],
    ['agent-pi-cad-typecheck', 'npm run check'],
    ['agent-pi-cad-tests', 'npm test'],
    ['agent-pi-cad-build', 'npm run build'],
  ])
  if (!Array.isArray(evidence.checks) || evidence.checks.length !== requiredChecks.size) {
    fail('clean-build evidence has the wrong number of checks')
  }
  for (const check of evidence.checks) {
    const expectedCommand = requiredChecks.get(check.id)
    if (!expectedCommand || check.command !== expectedCommand || check.result !== 'passed') {
      fail(`invalid clean-build evidence for ${check.id || '<unknown>'}`)
    }
    requiredChecks.delete(check.id)
  }
  if (requiredChecks.size > 0) fail(`clean-build evidence is missing ${[...requiredChecks.keys()].join(', ')}`)
  if (evidence.libredwgSourceCommit !== pins.sources.libredwgWeb.commit) fail('evidence has the wrong LibreDWG source commit')
  if (evidence.realdwgSourceCommit !== pins.sources.realdwgWeb.commit) fail('evidence has the wrong RealDWG source commit')
  const wasm = join(runtimeDir, 'workers', 'libredwg-web.wasm')
  const worker = join(runtimeDir, 'workers', 'libredwg-parser-worker.js')
  if (evidence.libredwgWasmSha256 !== sha256File(wasm)) fail('evidence WASM hash does not match the runtime')
  if (evidence.converterWorkerSha256 !== sha256File(worker)) fail('evidence worker hash does not match the runtime')
  return evidence.checks
}

export function createManifest({ sourceRoot, runtimeDir, toolchainPath, evidencePath, dshSource, sourceDateEpoch, pinsPath = defaultPinsPath }) {
  const pins = loadPins(pinsPath)
  assertHex(dshSource.commit, 40, 'Agent Pi DSH commit')
  assertHex(dshSource.tree, 40, 'Agent Pi DSH tree')
  if (dshSource.tag !== `v${pins.releaseVersion}`) fail(`Agent Pi DSH source tag must be v${pins.releaseVersion}`)
  assertSourceTree(sourceRoot, pins, dshSource)

  const toolchain = readJson(toolchainPath, 'toolchain report')
  assertToolchain(toolchain, pins)
  const runtimeFiles = inventoryRuntime(runtimeDir, pins)
  const evidence = readJson(evidencePath, 'clean-build evidence')
  const checks = assertBuildEvidence(evidence, runtimeDir, pins)
  const sourceInventory = writeSourceInventory(sourceRoot)
  const manifest = {
    schema: 'agent-pi-dsh/cad-clean-build/v1',
    releaseVersion: pins.releaseVersion,
    claim: 'Clean rebuild from pinned source; this does not claim bit-for-bit reproduction of the upstream npm WASM.',
    sourceDateEpoch: Number(sourceDateEpoch),
    sources: {
      ...pins.sources,
      agentPiDshCadIntegration: dshSource,
    },
    runtimeSourcePackages: pins.runtimeSourcePackages,
    publishedNpmReferences: publishedNpmReferences(pins),
    toolchain,
    sourceInventory,
    runtimeFiles,
    checks,
  }
  if (!Number.isSafeInteger(manifest.sourceDateEpoch) || manifest.sourceDateEpoch <= 0) {
    fail('SOURCE_DATE_EPOCH must be a positive integer')
  }

  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(join(sourceRoot, manifestName), manifestText)
  writeFileSync(join(runtimeDir, pins.runtimeReceipt), manifestText)
  return manifest
}

function verifyManifest(manifest, sourceRoot, runtimeDir, pins) {
  if (manifest.schema !== 'agent-pi-dsh/cad-clean-build/v1') fail('unsupported source manifest schema')
  if (manifest.releaseVersion !== pins.releaseVersion) fail('source manifest release version does not match pins')
  if (!String(manifest.claim).includes('does not claim bit-for-bit')) fail('source manifest must disclaim bit-for-bit reproduction')
  assertExact(manifest.sources.libredwgWeb, pins.sources.libredwgWeb, 'LibreDWG Web manifest source')
  assertExact(manifest.sources.jsmn, pins.sources.jsmn, 'jsmn manifest source')
  assertExact(manifest.sources.realdwgWeb, pins.sources.realdwgWeb, 'RealDWG Web manifest source')
  assertExact(manifest.sources.cadViewer, pins.sources.cadViewer, 'CAD Viewer manifest source')
  assertExact(manifest.sources.mtextRenderer, pins.sources.mtextRenderer, 'MText Renderer manifest source')
  assertExact(manifest.sources.mtextParser, pins.sources.mtextParser, 'MText Parser manifest source')
  assertExact(manifest.sources.shxParser, pins.sources.shxParser, 'SHX Parser manifest source')
  const dshSource = manifest.sources.agentPiDshCadIntegration
  assertHex(dshSource?.commit, 40, 'Agent Pi DSH manifest commit')
  assertHex(dshSource?.tree, 40, 'Agent Pi DSH manifest tree')
  if (dshSource?.tag !== `v${pins.releaseVersion}`) fail('Agent Pi DSH manifest tag does not match the release')
  assertExact(manifest.runtimeSourcePackages, pins.runtimeSourcePackages, 'runtime source package map')
  assertExact(manifest.publishedNpmReferences, publishedNpmReferences(pins), 'published npm references')
  if (!Number.isSafeInteger(manifest.sourceDateEpoch) || manifest.sourceDateEpoch <= 0) {
    fail('source manifest SOURCE_DATE_EPOCH must be a positive integer')
  }
  assertToolchain(manifest.toolchain, pins)
  assertSourceTree(sourceRoot, pins, manifest.sources.agentPiDshCadIntegration)
  verifySourceInventory(sourceRoot, manifest)
  const archivedEvidence = readJson(join(sourceRoot, 'build-evidence.json'), 'archived clean-build evidence')
  assertBuildEvidence(archivedEvidence, runtimeDir, pins)
  assertExact(manifest.checks, archivedEvidence.checks, 'clean build checks')

  const receipt = readJson(join(runtimeDir, pins.runtimeReceipt), 'runtime clean-build receipt')
  assertExact(receipt, manifest, 'runtime clean-build receipt')
  const runtimeFiles = inventoryRuntime(runtimeDir, pins)
  assertExact(runtimeFiles, manifest.runtimeFiles, 'clean runtime files')
}

function runTar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) fail(`tar ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`)
  return result.stdout
}

function assertSafeArchiveEntries(archivePath) {
  const entries = runTar(['-tzf', archivePath]).split(/\r?\n/).filter(Boolean)
  if (entries.length === 0) fail('source archive is empty')

  const verboseEntries = runTar(['-tvzf', archivePath]).split(/\r?\n/).filter(Boolean)
  if (verboseEntries.length !== entries.length) fail('source archive listings disagree')
  for (const entry of verboseEntries) {
    const type = entry[0]
    if (type !== '-' && type !== 'd') {
      const label = ({
        l: 'symbolic link',
        h: 'hard link',
        b: 'block device',
        c: 'character device',
        p: 'fifo',
        s: 'socket',
      })[type] || `type ${JSON.stringify(type)}`
      fail(`unsafe source archive entry type: ${label}`)
    }
  }

  for (const raw of entries) {
    const name = raw.replace(/^\.\//, '').replace(/\/$/, '')
    if (!name) continue
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
      fail(`unsafe source archive entry: ${raw}`)
    }
  }
}

export function verifyCadCleanRelease({ archivePath, checksumPath, runtimeDir, pinsPath = defaultPinsPath }) {
  const pins = loadPins(pinsPath)
  const expectedArchiveName = pins.sourceArchive
  if (basename(archivePath) !== expectedArchiveName) fail(`source archive must be named ${expectedArchiveName}`)
  if (basename(checksumPath) !== `${expectedArchiveName}.sha256`) fail(`source checksum must be named ${expectedArchiveName}.sha256`)

  const checksum = readFileSync(checksumPath, 'utf8').trim()
  const checksumMatch = checksum.match(/^([a-f0-9]{64})  ([^/\\]+)$/)
  if (!checksumMatch || checksumMatch[2] !== expectedArchiveName) fail('source archive checksum file is malformed')
  if (sha256File(archivePath) !== checksumMatch[1]) fail('source archive SHA256 does not match its checksum file')

  assertSafeArchiveEntries(archivePath)
  const extractionRoot = mkdtempSync(join(tmpdir(), 'agent-pi-cad-source-'))
  try {
    runTar(['-xzf', resolve(archivePath), '-C', extractionRoot])
    const manifest = readJson(join(extractionRoot, manifestName), 'source manifest')
    verifyManifest(manifest, extractionRoot, resolve(runtimeDir), pins)
    return manifest
  } finally {
    rmSync(extractionRoot, { recursive: true, force: true })
  }
}

function parseArgs(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith('--') || value === undefined) fail(`invalid argument near ${key || '<end>'}`)
    values.set(key.slice(2), value)
  }
  return values
}

function required(values, name) {
  const value = values.get(name)
  if (!value) fail(`--${name} is required`)
  return value
}

function createArchive(sourceRoot, archivePath, sourceDateEpoch) {
  runTar([
    '--sort=name',
    `--mtime=@${sourceDateEpoch}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-czf',
    resolve(archivePath),
    '-C',
    resolve(sourceRoot),
    '.',
  ])
  writeFileSync(`${archivePath}.sha256`, `${sha256File(archivePath)}  ${basename(archivePath)}\n`)
}

export function main(args = process.argv.slice(2)) {
  const command = args.shift()
  const values = parseArgs(args)
  const pinsPath = values.get('pins') || defaultPinsPath

  if (command === 'create') {
    const sourceRoot = resolve(required(values, 'source-root'))
    const runtimeDir = resolve(required(values, 'runtime-dir'))
    const archivePath = resolve(required(values, 'archive'))
    const sourceDateEpoch = required(values, 'source-date-epoch')
    const dshSource = sourceMarker(
      required(values, 'dsh-repository'),
      required(values, 'dsh-commit'),
      required(values, 'dsh-tree'),
      required(values, 'dsh-tag'),
    )
    createManifest({
      sourceRoot,
      runtimeDir,
      toolchainPath: resolve(required(values, 'toolchain')),
      evidencePath: resolve(required(values, 'evidence')),
      dshSource,
      sourceDateEpoch,
      pinsPath,
    })
    createArchive(sourceRoot, archivePath, sourceDateEpoch)
    process.stdout.write(`created ${archivePath}\n`)
    return
  }

  if (command === 'verify') {
    const manifest = verifyCadCleanRelease({
      archivePath: resolve(required(values, 'archive')),
      checksumPath: resolve(required(values, 'checksum')),
      runtimeDir: resolve(required(values, 'runtime-dir')),
      pinsPath,
    })
    process.stdout.write(`verified clean CAD rebuild for ${manifest.releaseVersion}\n`)
    return
  }

  fail('usage: cad-clean-release.mjs create|verify [options]')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
