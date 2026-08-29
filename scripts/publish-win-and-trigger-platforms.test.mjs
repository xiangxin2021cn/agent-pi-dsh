import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publishScript = join(root, 'scripts', 'publish-win-and-trigger-platforms.ps1')
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

test('v3 releases dispatch the runtime-payload desktop asset workflow', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-pi-publish-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))

  const log = join(fixture, 'gh.log')
  const installer = join(fixture, 'Agent-Pi-DSH-3.3.6-x64.exe')
  writeFileSync(installer, 'fixture')
  writeFileSync(join(fixture, 'gh.cmd'), '@echo off\r\n>>"%GH_LOG%" echo %*\r\nexit /b 0\r\n')

  const result = spawnSync(powershell, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', publishScript,
    '-Tag', 'v3.3.6',
    '-Repo', 'xiangxin2021cn/agent-pi-dsh',
    '-Installer', installer,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_LOG: log,
      Path: `${fixture};${process.env.Path ?? ''}`,
      PATH: `${fixture};${process.env.PATH ?? ''}`,
    },
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const calls = readFileSync(log, 'utf8').trim().split(/\r?\n/)
  assert.match(calls[0], /^release upload v3\.3\.6 .+ --repo xiangxin2021cn\/agent-pi-dsh --clobber$/)
  assert.ok(calls.includes('workflow run build-desktop-assets.yml --repo xiangxin2021cn/agent-pi-dsh -f tag=v3.3.6'))
  assert.equal(calls.some((call) => call.startsWith('api ')), false)
})
