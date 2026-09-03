import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { createManifest, verifyCadCleanRelease } from './cad-clean-release.mjs'

const gpl = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n'

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

function gitObjectHash(type, bytes) {
  return createHash('sha1').update(Buffer.from(`${type} ${bytes.length}\0`)).update(bytes).digest('hex')
}

function makeCommitEvidence(directory, tree, message = 'fixture') {
  const bytes = Buffer.from([
    `tree ${tree}`,
    'author Fixture <fixture@example.invalid> 1700000000 +0000',
    'committer Fixture <fixture@example.invalid> 1700000000 +0000',
    '',
    message,
    '',
  ].join('\n'))
  write(join(directory, '.agent-pi-git-commit.txt'), bytes)
  return gitObjectHash('commit', bytes)
}

function makeTagEvidence(directory, tag, commit) {
  const bytes = Buffer.from([
    `object ${commit}`,
    'type commit',
    `tag ${tag}`,
    'tagger Fixture <fixture@example.invalid> 1700000000 +0000',
    '',
    'fixture',
    '',
  ].join('\n'))
  write(join(directory, '.agent-pi-git-tag.txt'), bytes)
  return gitObjectHash('tag', bytes)
}

function makeGitExport(directory, { gitlink } = {}) {
  run('git', ['init', '-q'], directory)
  run('git', ['config', 'user.email', 'fixture@example.invalid'], directory)
  run('git', ['config', 'user.name', 'Fixture'], directory)
  run('git', ['add', '.'], directory)
  if (gitlink) {
    run('git', ['update-index', '--add', '--cacheinfo', `160000,${gitlink.commit},${gitlink.path}`], directory)
  }
  const tree = run('git', ['write-tree'], directory)
  const listing = run('git', ['-c', 'core.quotePath=false', 'ls-tree', '-r', '--full-tree', tree], directory) + '\n'
  rmSync(join(directory, '.git'), { recursive: true, force: true })
  write(join(directory, '.agent-pi-git-tree.txt'), listing)
  return tree
}

function encodeUleb(value) {
  const bytes = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value) byte |= 0x80
    bytes.push(byte)
  } while (value)
  return Buffer.from(bytes)
}

function validLargeWasm(marker = 'LibreDWG 0.7.10') {
  const payloadSize = 1024 * 1024 + 64
  const payload = Buffer.alloc(payloadSize)
  payload[0] = 0
  payload.write(marker, 1, 'latin1')
  return Buffer.concat([
    Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
    Buffer.from([0x00]),
    encodeUleb(payload.length),
    payload,
  ])
}

function createFixture(t, { dirtyWasm = false, failedEvidence = false, rejectFixtureWasm = false } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-pi-cad-clean-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const sourceRoot = join(fixture, 'source')
  const runtimeDir = join(fixture, 'cad-viewer')
  mkdirSync(sourceRoot, { recursive: true })

  const jsmn = join(sourceRoot, 'libredwg-web', 'jsmn')
  write(join(jsmn, 'LICENSE'), 'MIT fixture\n')
  write(join(jsmn, 'jsmn.h'), '/* fixture */\n')
  const jsmnTree = makeGitExport(jsmn)
  const jsmnCommit = makeCommitEvidence(jsmn, jsmnTree)

  const libre = join(sourceRoot, 'libredwg-web')
  write(join(libre, 'COPYING'), gpl)
  write(join(libre, 'bindings', 'javascript', 'package.json'), JSON.stringify({
    name: '@mlightcad/libredwg-web', version: '0.7.10', license: 'GPL-3.0',
  }) + '\n')
  const savedJsmn = join(fixture, 'saved-jsmn')
  cpSync(jsmn, savedJsmn, { recursive: true })
  rmSync(jsmn, { recursive: true, force: true })
  const libreTree = makeGitExport(libre, { gitlink: { path: 'jsmn', commit: jsmnCommit } })
  const libreCommit = makeCommitEvidence(libre, libreTree)
  const libreTagObject = makeTagEvidence(libre, 'v0.7.10', libreCommit)
  cpSync(savedJsmn, jsmn, { recursive: true })
  write(join(libre, '.tarball-version'), '0.7.10\n')

  const real = join(sourceRoot, 'realdwg-web')
  write(join(real, 'LICENSE'), 'MIT fixture\n')
  write(join(real, 'packages', 'libredwg-converter', 'package.json'), JSON.stringify({
    name: '@mlightcad/libredwg-converter', version: '3.14.3', license: 'GPL-3.0',
  }) + '\n')
  for (const [name, directory, version] of [
    ['@mlightcad/data-model', 'data-model', '1.14.3'],
    ['@mlightcad/common', 'common', '1.14.3'],
    ['@mlightcad/geometry-engine', 'geometry-engine', '3.14.3'],
    ['@mlightcad/graphic-interface', 'graphic-interface', '3.14.3'],
  ]) {
    write(join(real, 'packages', directory, 'package.json'), JSON.stringify({ name, version, license: 'MIT' }) + '\n')
  }
  const realTree = makeGitExport(real)
  const realCommit = makeCommitEvidence(real, realTree)
  const realTagObject = makeTagEvidence(real, 'v1.14.3', realCommit)

  const extraSources = {}
  for (const [key, directory, tag] of [
    ['cadViewer', 'cad-viewer', 'v1.6.3'],
    ['mtextRenderer', 'mtext-renderer', 'v0.12.4'],
    ['mtextParser', 'mtext-parser', 'v1.5.0'],
    ['shxParser', 'shx-parser', 'v1.4.5'],
  ]) {
    const path = join(sourceRoot, directory)
    write(join(path, 'LICENSE'), 'MIT fixture\n')
    const packageSpecs = {
      cadViewer: [
        ['@mlightcad/cad-simple-viewer', 'packages/cad-simple-viewer', '1.6.3'],
        ['@mlightcad/cad-simple-ui-plugin', 'packages/cad-simple-ui-plugin', '1.6.3'],
        ['@mlightcad/three-renderer', 'packages/three-renderer', '1.6.3'],
      ],
      mtextRenderer: [['@mlightcad/mtext-renderer', 'packages/mtext-renderer', '0.12.4']],
      mtextParser: [['@mlightcad/mtext-parser', '.', '1.5.0']],
      shxParser: [['@mlightcad/shx-parser', '.', '1.4.5']],
    }
    for (const [name, packagePath, version] of packageSpecs[key]) {
      write(join(path, packagePath, 'package.json'), JSON.stringify({ name, version, license: 'MIT' }) + '\n')
    }
    const tree = makeGitExport(path)
    const commit = makeCommitEvidence(path, tree)
    const tagObject = makeTagEvidence(path, tag, commit)
    extraSources[key] = {
      repository: `https://example.invalid/${directory}.git`,
      tag,
      tagObject,
      commit,
      tree,
    }
  }

  const dsh = join(sourceRoot, 'agent-pi-dsh-cad-integration')
  write(join(dsh, 'LICENSE'), gpl)
  write(join(dsh, 'package.json'), JSON.stringify({ name: 'agent-pi-dsh', version: '3.6.0' }) + '\n')
  write(join(dsh, 'tools', 'mlightcad-poc', 'package.json'), JSON.stringify({
    name: 'agent-pi-dsh-mlightcad-poc', version: '0.0.0', private: true,
  }) + '\n')
  write(join(dsh, 'WPS图片.png'), 'fixture\n')
  const dshTree = makeGitExport(dsh)
  const dshCommit = makeCommitEvidence(dsh, dshTree)
  write(join(dsh, '.agent-pi-full-git-tree.txt'), readFileSync(join(dsh, '.agent-pi-git-tree.txt')))

  const pins = {
    schema: 'agent-pi-dsh/cad-clean-pins/v1',
    releaseVersion: '3.6.0',
    sourceArchive: 'Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz',
    runtimeReceipt: 'CAD-CLEAN-BUILD.json',
    builder: {
      baseImage: `emscripten/emsdk:4.0.12-x64@sha256:${'a'.repeat(64)}`,
      emsdkVersion: '4.0.12',
      emsdkCommit: '2222222222222222222222222222222222222222',
      emscriptenCommit: '3333333333333333333333333333333333333333',
      autoconfHostAlias: 'wasm32-unknown-emscripten',
      nodeVersion: 'v22.16.0',
      pnpmVersion: '10.33.4',
    },
    sources: {
      libredwgWeb: {
        repository: 'https://example.invalid/libredwg-web.git',
        tag: 'v0.7.10',
        tagObject: libreTagObject,
        commit: libreCommit,
        tree: libreTree,
        packageName: '@mlightcad/libredwg-web',
        packageVersion: '0.7.10',
        npmIntegrity: 'sha512-fixture',
        rejectedPublishedWasmSha256: 'f'.repeat(64),
      },
      jsmn: {
        repository: 'https://example.invalid/jsmn.git',
        commit: jsmnCommit,
        tree: jsmnTree,
      },
      realdwgWeb: {
        repository: 'https://example.invalid/realdwg-web.git',
        tag: 'v1.14.3',
        tagObject: realTagObject,
        commit: realCommit,
        tree: realTree,
        packageName: '@mlightcad/libredwg-converter',
        packageVersion: '3.14.3',
        npmIntegrity: 'sha512-fixture',
      },
      ...extraSources,
    },
    runtimeSourcePackages: [
      ['@mlightcad/libredwg-web', '0.7.10', 'GPL-3.0', 'libredwg-web/bindings/javascript/package.json'],
      ['@mlightcad/libredwg-converter', '3.14.3', 'GPL-3.0', 'realdwg-web/packages/libredwg-converter/package.json'],
      ['@mlightcad/data-model', '1.14.3', 'MIT', 'realdwg-web/packages/data-model/package.json'],
      ['@mlightcad/common', '1.14.3', 'MIT', 'realdwg-web/packages/common/package.json'],
      ['@mlightcad/geometry-engine', '3.14.3', 'MIT', 'realdwg-web/packages/geometry-engine/package.json'],
      ['@mlightcad/graphic-interface', '3.14.3', 'MIT', 'realdwg-web/packages/graphic-interface/package.json'],
      ['@mlightcad/cad-simple-viewer', '1.6.3', 'MIT', 'cad-viewer/packages/cad-simple-viewer/package.json'],
      ['@mlightcad/cad-simple-ui-plugin', '1.6.3', 'MIT', 'cad-viewer/packages/cad-simple-ui-plugin/package.json'],
      ['@mlightcad/three-renderer', '1.6.3', 'MIT', 'cad-viewer/packages/three-renderer/package.json'],
      ['@mlightcad/mtext-renderer', '0.12.4', 'MIT', 'mtext-renderer/packages/mtext-renderer/package.json'],
      ['@mlightcad/mtext-parser', '1.5.0', 'MIT', 'mtext-parser/package.json'],
      ['@mlightcad/shx-parser', '1.4.5', 'MIT', 'shx-parser/package.json'],
    ].map(([name, version, license, source]) => ({ name, version, license, source })),
    requiredRuntimeArtifacts: ['workers/libredwg-parser-worker.js', 'workers/libredwg-web.wasm'],
  }

  const wasm = validLargeWasm(dirtyWasm ? 'LibreDWG 0.7.10_dirty' : 'LibreDWG 0.7.10')
  if (rejectFixtureWasm) pins.sources.libredwgWeb.rejectedPublishedWasmSha256 = createHash('sha256').update(wasm).digest('hex')
  const pinsPath = join(fixture, 'pins.json')
  write(pinsPath, JSON.stringify(pins, null, 2) + '\n')

  write(join(libre, '.agent-pi-source.json'), JSON.stringify({
    repository: pins.sources.libredwgWeb.repository,
    tag: pins.sources.libredwgWeb.tag,
    tagObject: pins.sources.libredwgWeb.tagObject,
    commit: pins.sources.libredwgWeb.commit,
    tree: pins.sources.libredwgWeb.tree,
  }, null, 2) + '\n')
  write(join(jsmn, '.agent-pi-source.json'), JSON.stringify({
    repository: pins.sources.jsmn.repository,
    commit: pins.sources.jsmn.commit,
    tree: pins.sources.jsmn.tree,
  }, null, 2) + '\n')
  write(join(real, '.agent-pi-source.json'), JSON.stringify({
    repository: pins.sources.realdwgWeb.repository,
    tag: pins.sources.realdwgWeb.tag,
    tagObject: pins.sources.realdwgWeb.tagObject,
    commit: pins.sources.realdwgWeb.commit,
    tree: pins.sources.realdwgWeb.tree,
  }, null, 2) + '\n')
  for (const [key, directory] of [
    ['cadViewer', 'cad-viewer'],
    ['mtextRenderer', 'mtext-renderer'],
    ['mtextParser', 'mtext-parser'],
    ['shxParser', 'shx-parser'],
  ]) {
    write(join(sourceRoot, directory, '.agent-pi-source.json'), JSON.stringify(extraSources[key], null, 2) + '\n')
  }
  const dshSource = {
    repository: 'https://example.invalid/agent-pi-dsh.git',
    tag: 'v3.6.0',
    commit: dshCommit,
    tree: dshTree,
  }
  write(join(dsh, '.agent-pi-source.json'), JSON.stringify(dshSource, null, 2) + '\n')

  write(join(sourceRoot, 'LICENSES', 'GPL-3.0.txt'), gpl)
  write(join(sourceRoot, 'BUILD-INSTRUCTIONS.md'), '# Build\n')
  write(join(sourceRoot, 'THIRD-PARTY-SOURCES.md'), '# Sources\n')
  write(join(sourceRoot, 'toolchain-sources', 'mimalloc', 'LICENSE'), 'MIT fixture\n')
  write(join(sourceRoot, 'toolchain-sources', 'zlib', 'LICENSE'), 'zlib fixture\n')
  write(join(sourceRoot, 'toolchain-sources', 'emmalloc.c'), '/* fixture */\n')
  write(join(sourceRoot, 'toolchain-sources', 'emscripten-LICENSE'), 'fixture\n')

  write(join(runtimeDir, 'index.html'), '<!doctype html>\n')
  write(join(runtimeDir, 'workers', 'libredwg-web.wasm'), wasm)
  write(join(runtimeDir, 'workers', 'libredwg-parser-worker.js'),
    'self.onmessage = () => { postMessage("libredwg-web.wasm"); WebAssembly.validate(new Uint8Array()) }\n')

  const toolchainPath = join(sourceRoot, 'toolchain.json')
  write(toolchainPath, JSON.stringify({
    ...pins.builder,
    builderImageId: `sha256:${'b'.repeat(64)}`,
    emccVersion: 'emcc (Emscripten gcc/clang-like replacement) 4.0.12',
    autoconfVersion: 'autoconf 2.71',
    automakeVersion: 'automake 1.16.5',
    libtoolVersion: 'libtoolize 2.4.6',
    makeVersion: 'GNU Make 4.3',
    aptPackages: { autoconf: '2.71-2' },
  }, null, 2) + '\n')

  const evidencePath = join(sourceRoot, 'build-evidence.json')
  const checks = [
    { id: 'libredwg-node-api', command: 'pnpm test', result: failedEvidence ? 'failed' : 'passed' },
    { id: 'realdwg-converter-build', command: 'pnpm --filter @mlightcad/libredwg-converter... run build', result: 'passed' },
    { id: 'agent-pi-cad-typecheck', command: 'npm run check', result: 'passed' },
    { id: 'agent-pi-cad-tests', command: 'npm test', result: 'passed' },
    { id: 'agent-pi-cad-build', command: 'npm run build', result: 'passed' },
  ]
  write(evidencePath, JSON.stringify({
    schema: 'agent-pi-dsh/cad-clean-evidence/v1',
    libredwgSourceCommit: pins.sources.libredwgWeb.commit,
    realdwgSourceCommit: pins.sources.realdwgWeb.commit,
    libredwgWasmSha256: createHash('sha256').update(wasm).digest('hex'),
    converterWorkerSha256: createHash('sha256').update(readFileSync(join(runtimeDir, 'workers', 'libredwg-parser-worker.js'))).digest('hex'),
    checks,
  }, null, 2) + '\n')

  return { fixture, sourceRoot, runtimeDir, pins, pinsPath, toolchainPath, evidencePath, dshSource }
}

function buildArchive(fixture) {
  createManifest({
    sourceRoot: fixture.sourceRoot,
    runtimeDir: fixture.runtimeDir,
    toolchainPath: fixture.toolchainPath,
    evidencePath: fixture.evidencePath,
    dshSource: fixture.dshSource,
    sourceDateEpoch: 1700000000,
    pinsPath: fixture.pinsPath,
  })
  const archivePath = join(fixture.fixture, fixture.pins.sourceArchive)
  run('tar', ['-czf', archivePath, '-C', fixture.sourceRoot, '.'], fixture.fixture)
  const checksumPath = `${archivePath}.sha256`
  write(checksumPath, `${createHash('sha256').update(readFileSync(archivePath)).digest('hex')}  ${fixture.pins.sourceArchive}\n`)
  return { archivePath, checksumPath }
}

test('clean CAD manifest and corresponding-source archive verify end to end', (t) => {
  const fixture = createFixture(t)
  const { archivePath, checksumPath } = buildArchive(fixture)
  const manifest = verifyCadCleanRelease({
    archivePath,
    checksumPath,
    runtimeDir: fixture.runtimeDir,
    pinsPath: fixture.pinsPath,
  })
  assert.equal(manifest.releaseVersion, '3.6.0')
  assert.match(manifest.claim, /does not claim bit-for-bit/)
  assert.equal(manifest.checks.every((check) => check.result === 'passed'), true)
  assert.equal(manifest.publishedNpmReferences.usedAsNativeBuildInput, false)
})

test('release verifier rejects archive hard links before extraction', (t) => {
  const fixture = createFixture(t)
  const attackRoot = join(fixture.fixture, 'hard-link-archive')
  const target = join(attackRoot, 'target.txt')
  mkdirSync(attackRoot, { recursive: true })
  write(target, 'fixture\n')
  linkSync(target, join(attackRoot, 'linked.txt'))

  const archivePath = join(fixture.fixture, fixture.pins.sourceArchive)
  run('tar', ['-czf', archivePath, '-C', attackRoot, '.'], fixture.fixture)
  const checksumPath = `${archivePath}.sha256`
  write(checksumPath, `${createHash('sha256').update(readFileSync(archivePath)).digest('hex')}  ${fixture.pins.sourceArchive}\n`)

  assert.throws(() => verifyCadCleanRelease({
    archivePath,
    checksumPath,
    runtimeDir: fixture.runtimeDir,
    pinsPath: fixture.pinsPath,
  }), /unsafe source archive entry type: hard link/)
})

test('release verifier rejects archive symbolic links before extraction', (t) => {
  const fixture = createFixture(t)
  const attackRoot = join(fixture.fixture, 'symbolic-link-archive')
  const target = join(attackRoot, 'target.txt')
  mkdirSync(attackRoot, { recursive: true })
  write(target, 'fixture\n')
  symlinkSync(target, join(attackRoot, 'linked.txt'), 'file')

  const archivePath = join(fixture.fixture, fixture.pins.sourceArchive)
  run('tar', ['-czf', archivePath, '-C', attackRoot, '.'], fixture.fixture)
  const checksumPath = `${archivePath}.sha256`
  write(checksumPath, `${createHash('sha256').update(readFileSync(archivePath)).digest('hex')}  ${fixture.pins.sourceArchive}\n`)

  assert.throws(() => verifyCadCleanRelease({
    archivePath,
    checksumPath,
    runtimeDir: fixture.runtimeDir,
    pinsPath: fixture.pinsPath,
  }), /unsafe source archive entry type: symbolic link/)
})

test('manifest creation rejects a dirty-source WASM marker', (t) => {
  const fixture = createFixture(t, { dirtyWasm: true })
  assert.throws(() => buildArchive(fixture), /dirty-source version marker/)
})

test('manifest creation rejects the known published dirty WASM hash', (t) => {
  const fixture = createFixture(t, { rejectFixtureWasm: true })
  assert.throws(() => buildArchive(fixture), /known upstream dirty-build binary/)
})

test('manifest creation rejects missing or failed test evidence', (t) => {
  const fixture = createFixture(t, { failedEvidence: true })
  assert.throws(() => buildArchive(fixture), /invalid clean-build evidence/)
})

test('manifest creation recomputes source Git objects', (t) => {
  const fixture = createFixture(t)
  write(join(fixture.sourceRoot, 'realdwg-web', 'LICENSE'), 'tampered\n')
  assert.throws(() => buildArchive(fixture), /Git blob hash mismatch/)
})

test('manifest creation authenticates raw source commit and tag objects', (t) => {
  const fixture = createFixture(t)
  write(join(fixture.sourceRoot, 'libredwg-web', '.agent-pi-git-tag.txt'), 'tampered\n')
  assert.throws(() => buildArchive(fixture), /raw tag object/)
})

test('manifest creation binds the selected Agent Pi export to the full pinned tree', (t) => {
  const fixture = createFixture(t)
  const dsh = join(fixture.sourceRoot, 'agent-pi-dsh-cad-integration')
  const packagePath = join(dsh, 'package.json')
  const bytes = Buffer.from('{ "name": "agent-pi-dsh", "version": "3.6.0" }\n')
  write(packagePath, bytes)
  const partialPath = join(dsh, '.agent-pi-git-tree.txt')
  const partial = readFileSync(partialPath, 'utf8').replace(
    /^100644 blob [a-f0-9]{40}\tpackage\.json$/m,
    `100644 blob ${gitObjectHash('blob', bytes)}\tpackage.json`,
  )
  write(partialPath, partial)
  assert.throws(() => buildArchive(fixture), /partial Git export is not bound to its full tree/)
})

test('manifest creation binds the nested jsmn source to the LibreDWG gitlink', (t) => {
  const fixture = createFixture(t)
  const jsmn = join(fixture.sourceRoot, 'libredwg-web', 'jsmn')
  const commit = makeCommitEvidence(jsmn, fixture.pins.sources.jsmn.tree, 'different fixture commit')
  fixture.pins.sources.jsmn.commit = commit
  write(fixture.pinsPath, JSON.stringify(fixture.pins, null, 2) + '\n')
  write(join(jsmn, '.agent-pi-source.json'), JSON.stringify({
    repository: fixture.pins.sources.jsmn.repository,
    commit,
    tree: fixture.pins.sources.jsmn.tree,
  }, null, 2) + '\n')
  assert.throws(() => buildArchive(fixture), /LibreDWG jsmn gitlink/)
})

test('release verifier rejects runtime changes after the clean build', (t) => {
  const fixture = createFixture(t)
  const { archivePath, checksumPath } = buildArchive(fixture)
  write(join(fixture.runtimeDir, 'workers', 'libredwg-parser-worker.js'), 'tampered\n')
  assert.throws(() => verifyCadCleanRelease({
    archivePath,
    checksumPath,
    runtimeDir: fixture.runtimeDir,
    pinsPath: fixture.pinsPath,
  }), /parser worker is missing API marker|evidence worker hash does not match|clean runtime files/)
})

test('formal packaging paths require the clean verifier and do not rebuild CAD from npm', () => {
  const repositoryRoot = join(import.meta.dirname, '..')
  const windowsPack = readFileSync(join(repositoryRoot, 'scripts', 'pack-win.ps1'), 'utf8')
  const payloadPack = readFileSync(join(repositoryRoot, 'scripts', 'pack-runtime-payload.mjs'), 'utf8')
  const publisher = readFileSync(join(repositoryRoot, 'release', 'publish-v3.6.0-release.mjs'), 'utf8')
  const uploader = readFileSync(join(repositoryRoot, 'scripts', 'publish-win-and-trigger-platforms.ps1'), 'utf8')

  assert.match(windowsPack, /cad-clean-release\.mjs"\) verify/)
  assert.doesNotMatch(windowsPack, /Invoke-NpmBuild \$CadPoc/)
  assert.match(payloadPack, /verifyCadCleanRelease/)
  assert.doesNotMatch(payloadPack, /npmCli, 'run', 'build'.+cadPoc/s)
  assert.match(publisher, /verifyCadCleanRelease\(\{/)
  assert.match(uploader, /CAD-corresponding-source\.tar\.gz/)
  assert.match(uploader, /\$UploadAssets \+= @\(\$InstallerBuildReceipt, \$CadSource, \$CadSourceChecksum\)/)
})
