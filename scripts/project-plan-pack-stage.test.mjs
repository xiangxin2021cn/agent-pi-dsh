import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

test('the final Windows product copy excludes Maven target and retains runtime JARs, sources and licenses', { skip: process.platform !== 'win32' }, () => {
  const temporary = mkdtempSync(join(tmpdir(), 'agent-pi-project-plan-stage-'))
  const root = join(temporary, 'product')
  const stage = join(temporary, 'stage', 'bundles')
  const retained = {
    'project-plan/runtime/lib/mpxj.jar': 'runtime jar bytes',
    'project-plan/runtime/sources/mpxj-sources.jar': 'required corresponding source bytes',
    'project-plan/runtime/classes/ProjectPlan.class': 'runtime bridge bytes',
    'project-plan/legal/MPXJ-LICENSE.txt': 'upstream license bytes',
    'project-plan/THIRD_PARTY_NOTICES.md': 'upstream notices bytes',
    'project-plan/src/ProjectPlan.java': 'bridge source bytes',
    'engineering-cad/lib/index.js': 'another runtime bundle',
  }
  const put = (name, value) => {
    const path = join(root, 'bundles', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, value)
  }
  try {
    for (const [name, value] of Object.entries(retained)) put(name, value)
    put('project-plan/target/lib/mpxj.jar', retained['project-plan/runtime/lib/mpxj.jar'])
    put('project-plan/target/sources/mpxj-sources.jar', retained['project-plan/runtime/sources/mpxj-sources.jar'])
    put('project-plan/target/classes/ProjectPlan.class', retained['project-plan/runtime/classes/ProjectPlan.class'])
    const helper = join(temporary, 'copy-production-command.ps1')
    writeFileSync(helper, `param([string]$ScriptPath, [string]$FixtureRoot, [string]$StageDirectory)
$ErrorActionPreference = 'Stop'
$taskTokens = $null
$taskErrors = $null
$taskAst = [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$taskTokens, [ref]$taskErrors)
if ($taskErrors.Count) { throw 'Packaging script has syntax errors' }
$taskCopies = @($taskAst.FindAll({ param($taskNode)
  $taskNode -is [System.Management.Automation.Language.CommandAst] -and
  $taskNode.GetCommandName() -eq 'robocopy' -and
  $taskNode.CommandElements[1].Extent.Text -eq '$src' -and
  $taskNode.CommandElements[2].Extent.Text -eq '$dest'
}, $true))
if ($taskCopies.Count -ne 1) { throw 'Expected the one final product-copy command' }
$Root = $FixtureRoot
$src = Join-Path $Root 'bundles'
$dest = $StageDirectory
Invoke-Expression $taskCopies[0].Extent.Text | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Actual product copy failed: $LASTEXITCODE" }
`, 'utf8')
    const script = join(dirname(fileURLToPath(import.meta.url)), 'pack-win.ps1')
    const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper, script, root, stage], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
    assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout)
    assert.equal(existsSync(join(stage, 'project-plan', 'target')), false)
    for (const [name, value] of Object.entries(retained)) assert.equal(readFileSync(join(stage, name), 'utf8'), value, name)
    assert.equal(readFileSync(join(root, 'bundles/project-plan/target/lib/mpxj.jar'), 'utf8'), retained['project-plan/runtime/lib/mpxj.jar'])
  } finally {
    assert.ok(realpathSync(temporary).startsWith(realpathSync(resolve(tmpdir())) + sep))
    rmSync(temporary, { recursive: true, force: true })
  }
})
