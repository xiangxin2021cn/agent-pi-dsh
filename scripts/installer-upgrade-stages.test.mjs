import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { dshBuildCommands, dshBuildReceiptSchema, verifyDshBuildReceipt } from './dsh-build-receipt.mjs'
import { expectedDshCommit, expectedDshVersion } from './verify-dsh-runtime.mjs'

const repository = fileURLToPath(new URL('..', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const nsisString = value => String(value).replaceAll('$', () => '$$').replaceAll('"', '$\\"')
const sourcePaths = ['package.json', 'packages/core/tools/package.json', 'packages/llm/llm/package.json', 'vendor/cordis/package.json'].sort()
const artifactPaths = ['apps/cli/lib/bin.js', 'apps/web/dist/index.html', 'packages/core/tools/lib/index.js', 'packages/llm/llm/lib/index.js', 'vendor/cordis/lib/index.js'].sort()

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function run(binary, args, cwd, log) {
  const result = spawnSync(binary, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
  if (log) write(log, `${result.stdout || ''}\n${result.stderr || ''}`)
  assert.ifError(result.error)
  return result
}

function instrumentProduction(source) {
  // Keep production branching and commands; only isolate scratch paths and
  // suppress interactive failure UI in this fixture-only executable.
  return source.replaceAll('$PLUGINSDIR', '$ProbePluginsDir')
    .replace(/^\s*MessageBox[^\r\n]*$/gm, '    DetailPrint "Fixture failure: interactive message suppressed"')
    .replace(/^\s*Abort\s*$/gm, '    Quit')
}

test('production NSIS upgrade stages preserve shared peers and gate the final installed receipt', {
  skip: process.platform !== 'win32' && 'Production NSIS upgrade stages require Windows',
  timeout: 180000,
}, async (t) => {
  const base = join(repository, '.codex-temp')
  mkdirSync(base, { recursive: true })
  const fixture = mkdtempSync(join(realpathSync(base), 'installer-upgrade-stages-'))
  t.after(() => {
    assert.equal(realpathSync(fixture), fixture)
    assert.ok(fixture.startsWith(realpathSync(base) + sep))
    rmSync(fixture, { recursive: true, force: true })
  })
  const compiler = [process.env.MAKENSIS, process.env.NSIS_HOME && join(process.env.NSIS_HOME, 'makensis.exe'), process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'NSIS/makensis.exe'), process.env.ProgramFiles && join(process.env.ProgramFiles, 'NSIS/makensis.exe')].find(path => path && existsSync(path))
  const archiver = [process.env.AGENT_PI_TEST_7ZA, join(repository, 'apps/desktop/dist-nsis/7za.exe'), process.env.ProgramFiles && join(process.env.ProgramFiles, '7-Zip/7z.exe')].find(path => path && existsSync(path) && statSync(path).size > 102400)
  assert.ok(compiler, 'makensis.exe is required')
  assert.ok(archiver, 'A full 7za/7z executable is required; set AGENT_PI_TEST_7ZA when no packaged copy exists')
  const source = join(fixture, 'payload-source')
  const dshRelative = 'resources/runtime/deepseek-harness'
  const productRelative = 'resources/runtime/product'
  const payloadDsh = join(source, dshRelative)
  const payloadProduct = join(source, productRelative)
  for (const path of sourcePaths) write(join(payloadDsh, path), path === 'package.json' ? JSON.stringify({ version: expectedDshVersion }) : `new manifest ${path}\n`)
  for (const path of artifactPaths) write(join(payloadDsh, path), `new artifact ${path}\n`)
  write(join(payloadProduct, 'DSH_PIN'), expectedDshCommit)
  for (const name of ['installer-remove-univer-tree.mjs', 'dsh-build-receipt.mjs', 'dsh-runtime-file-policy.json', 'verify-dsh-runtime.mjs']) {
    write(join(payloadProduct, 'scripts', name), readFileSync(join(repository, 'scripts', name)))
  }
  write(join(source, 'resources/runtime/node/node.exe'), readFileSync(process.execPath))
  const entry = path => ({ path, bytes: statSync(join(payloadDsh, path)).size, sha256: hash(readFileSync(join(payloadDsh, path))) })
  const receipt = { schemaVersion: dshBuildReceiptSchema, kind: 'agent-pi-dsh-official-build', dshCommit: expectedDshCommit, dshVersion: expectedDshVersion, dshPin: expectedDshCommit, buildCommands: dshBuildCommands, sourceFiles: sourcePaths.map(entry), artifacts: artifactPaths.map(entry) }
  write(join(payloadDsh, 'DSH-BUILD-RECEIPT.json'), JSON.stringify(receipt))
  const payload = join(fixture, 'payload.7z')
  const archived = run(archiver, ['a', '-t7z', '-mx=1', '-ms=off', '-bd', payload, '.'], source, join(fixture, 'archive.log'))
  assert.equal(archived.status, 0, archived.stderr)
  const missingHelperPayload = join(fixture, 'missing-helper.7z')
  copyFileSync(payload, missingHelperPayload)
  const removed = run(archiver, ['d', '-bd', missingHelperPayload, 'resources/runtime/product/scripts/installer-remove-univer-tree.mjs'], fixture)
  assert.equal(removed.status, 0, removed.stderr)

  const setup = readFileSync(new URL('./nsis/setup.nsi', import.meta.url), 'utf8')
  const functions = ['PrepareUniverCleanup', 'StageUniverVendor', 'RollbackAppAsar', 'CommitUniverVendor'].map(name => {
    const body = setup.match(new RegExp(`Function ${name}\\r?\\n[\\s\\S]*?\\r?\\nFunctionEnd`))?.[0]
    assert.ok(body, `missing production function ${name}`)
    return instrumentProduction(body)
  }).join('\n')
  const gate = setup.match(/  DetailPrint "Verifying installed DeepSeek Harness build receipt\.\.\."[\s\S]*?  installed_runtime_verified:\r?\n  SetOutPath "\$INSTDIR"/)?.[0]
  assert.ok(gate, 'missing production final receipt gate')
  assert.match(gate, /verify-installed/)
  const cases = [
    { name: 'normal-upgrade', interrupted: false, fault: false, missingHelper: false, exitCode: 0 },
    { name: 'interrupted-upgrade', interrupted: true, fault: false, missingHelper: false, exitCode: 0 },
    { name: 'damaged-after-cleanup', interrupted: false, fault: true, missingHelper: false, exitCode: 10 },
    { name: 'missing-trusted-helper', interrupted: false, fault: false, missingHelper: true, exitCode: 9 },
  ]
  for (const item of cases) await t.test(item.name, () => {
    const area = join(fixture, item.name)
    const install = join(area, 'install with spaces')
    const dsh = join(install, dshRelative)
    const product = join(install, productRelative)
    const current = join(product, 'vendor/dsh-univer-office')
    const previous = join(product, 'vendor/.agent-pi-univer-previous')
    const plugins = join(area, 'probe-plugins')
    mkdirSync(plugins, { recursive: true })
    for (const path of [...sourcePaths, ...artifactPaths]) write(join(dsh, path), `old ${path}\n`)
    write(join(dsh, 'packages/retired/source.ts'), 'old unused source\n')
    write(join(dsh, 'packages/retired/lib/index.js'), 'old unused artifact\n')
    // The old runtime deliberately has no Node and an unusable cleanup helper.
    // PrepareUniverCleanup must obtain both from the incoming payload.
    write(join(product, 'scripts/installer-remove-univer-tree.mjs'), 'throw new Error("old helper must not execute")\n')
    for (const tree of item.interrupted ? [current, previous] : [current]) {
      write(join(tree, 'package.json'), tree === previous ? 'previous preserved plugin' : 'old current plugin')
      for (const [name, relative] of [['dsh-tools', 'packages/core/tools'], ['dsh-llm', 'packages/llm/llm'], ['cordis', 'vendor/cordis']]) {
        const target = join(dsh, relative)
        const dest = join(tree, 'node_modules/@deepseek-ai', name)
        assert.ok(resolve(dest).startsWith(fixture + sep) && realpathSync(target).startsWith(fixture + sep))
        mkdirSync(dirname(dest), { recursive: true })
        symlinkSync(target, dest, 'junction')
      }
    }
    const physicalFiles = [...sourcePaths, ...artifactPaths].map(path => join(dsh, path))
    const oldHashes = physicalFiles.map(file => hash(readFileSync(file)))
    const newHashes = [...sourcePaths, ...artifactPaths].map(path => hash(readFileSync(join(payloadDsh, path))))
    const audit = join(area, 'audit.mjs')
    const snapshots = join(area, 'snapshots.json')
    write(audit, `import fs from 'node:fs'\nimport {createHash} from 'node:crypto'\nconst file=${JSON.stringify(snapshots)}\nconst data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[]\ndata.push({phase:process.argv[2],hashes:${JSON.stringify(physicalFiles)}.map(path=>fs.existsSync(path)?createHash('sha256').update(fs.readFileSync(path)).digest('hex'):null),current:fs.existsSync(${JSON.stringify(current)}),previous:fs.existsSync(${JSON.stringify(previous)})})\nfs.writeFileSync(file,JSON.stringify(data))\n`)
    copyFileSync(archiver, join(plugins, '7za.exe'))
    // Full 7z uses a sibling DLL; the packaged 7za does not need one.
    if (existsSync(join(dirname(archiver), '7z.dll'))) copyFileSync(join(dirname(archiver), '7z.dll'), join(plugins, '7z.dll'))
    copyFileSync(item.missingHelper ? missingHelperPayload : payload, join(plugins, 'payload.7z'))
    const checkpoint = phase => `nsExec::ExecToLog '"$ProbePluginsDir\\node.exe" "${audit}" "${phase}"'\nPop $0\nStrCmp $0 "0" +2\nAbort`
    const fault = item.fault ? `Delete "${nsisString(join(dsh, 'packages/core/tools/lib/index.js'))}"` : ''
    const binary = join(area, 'upgrade-probe.exe')
    const probe = join(area, 'upgrade-probe.nsi')
    write(probe, `Unicode true\nName "Isolated production upgrade stage probe"\nRequestExecutionLevel user\nSilentInstall silent\nAutoCloseWindow true\nOutFile "${nsisString(binary)}"\nVar ProbePluginsDir\n${functions}\nSection\nStrCpy $INSTDIR "${nsisString(install)}"\nStrCpy $ProbePluginsDir "${nsisString(plugins)}"\nCall PrepareUniverCleanup\nCall StageUniverVendor\n${checkpoint('after-stage')}\nnsExec::ExecToLog '"$ProbePluginsDir\\7za.exe" x -y -aoa -bd "$ProbePluginsDir\\payload.7z" "-o$INSTDIR"'\nPop $0\nStrCmp $0 "0" overlay_ok\nSetErrorLevel 3\nQuit\noverlay_ok:\n${checkpoint('after-overlay')}\nCall CommitUniverVendor\n${checkpoint('after-cleanup')}\n${fault}\n${instrumentProduction(gate)}\nFileOpen $9 "$OUTDIR\\finalized.txt" w\nFileWrite $9 "verified"\nFileClose $9\nSectionEnd\n`)
    // No production Install/Uninstall section, registry, shortcuts, process
    // termination, user profile, or application startup enters this probe.
    const compile = run(compiler, ['/V2', probe], area, join(area, 'compiler.log'))
    assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`)
    const result = run(binary, [], area, join(area, 'run.log'))
    assert.equal(result.status, item.exitCode, result.stderr)
    if (item.missingHelper) {
      assert.deepEqual(physicalFiles.map(file => hash(readFileSync(file))), oldHashes)
      assert.equal(existsSync(current), true)
      assert.equal(existsSync(previous), false)
      assert.equal(existsSync(snapshots), false)
    } else {
      const stages = JSON.parse(readFileSync(snapshots))
      assert.deepEqual(stages.map(stage => stage.phase), ['after-stage', 'after-overlay', 'after-cleanup'])
      assert.deepEqual(stages[0].hashes, oldHashes, 'staging must preserve old shared peers before overlay')
      assert.equal(stages[0].current, false)
      assert.equal(stages[0].previous, true)
      assert.deepEqual(stages[1].hashes, newHashes, 'the real archive overlay must install the declared current bytes')
      assert.deepEqual(stages[2].hashes, newHashes, 'production backup cleanup must preserve newly overlaid shared peers')
      assert.equal(stages[2].previous, false)
    }
    assert.equal(existsSync(join(install, 'finalized.txt')), item.exitCode === 0)
    if (item.exitCode === 0) {
      const options = { dshRoot: dsh, productRoot: product, receiptPath: join(dsh, 'DSH-BUILD-RECEIPT.json') }
      assert.doesNotThrow(() => verifyDshBuildReceipt({ ...options, installed: true }))
      assert.throws(() => verifyDshBuildReceipt(options), /inventory length mismatch/)
      assert.equal(readFileSync(join(dsh, 'packages/retired/source.ts'), 'utf8'), 'old unused source\n')
    }
  })
})
