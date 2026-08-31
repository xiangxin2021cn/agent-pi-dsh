import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const installer = join(fixture, 'Agent-Pi-DSH-3.4.0-x64.exe')
  const payload = join(fixture, 'runtime-payload-3.4.0.tar.gz')
  writeFileSync(installer, 'fixture')
  writeFileSync(`${installer}.sha256`, 'fixture hash')
  writeFileSync(payload, 'payload')
  writeFileSync(`${payload}.sha256`, 'fixture hash')
  writeFileSync(join(fixture, 'gh.cmd'), '@echo off\r\n>>"%GH_LOG%" echo %*\r\nexit /b 0\r\n')

  const result = spawnSync(powershell, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', publishScript,
    '-Tag', 'v3.4.0',
    '-Repo', 'xiangxin2021cn/agent-pi-dsh',
    '-Installer', installer,
    '-Payload', payload,
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
  assert.match(calls[0], /^release upload v3\.4\.0 .+Agent-Pi-DSH-3\.4\.0-x64\.exe .+Agent-Pi-DSH-3\.4\.0-x64\.exe\.sha256 .+runtime-payload-3\.4\.0\.tar\.gz .+runtime-payload-3\.4\.0\.tar\.gz\.sha256 --repo xiangxin2021cn\/agent-pi-dsh$/)
  assert.ok(calls.includes('workflow run build-desktop-assets.yml --repo xiangxin2021cn/agent-pi-dsh --ref v3.4.0 -f tag=v3.4.0'))
  assert.equal(calls.some((call) => call.includes('--clobber')), false)
  assert.equal(calls.some((call) => call.startsWith('api ')), false)
})

test('v3 release refuses to dispatch when the runtime payload is missing', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-pi-publish-missing-payload-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))

  const log = join(fixture, 'gh.log')
  const installer = join(fixture, 'Agent-Pi-DSH-3.4.0-x64.exe')
  writeFileSync(installer, 'fixture')
  writeFileSync(`${installer}.sha256`, 'fixture hash')
  writeFileSync(join(fixture, 'gh.cmd'), '@echo off\r\n>>"%GH_LOG%" echo %*\r\nexit /b 0\r\n')

  const result = spawnSync(powershell, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', publishScript,
    '-Tag', 'v3.4.0',
    '-Repo', 'xiangxin2021cn/agent-pi-dsh',
    '-Installer', installer,
    '-Payload', join(fixture, 'runtime-payload-3.4.0.tar.gz'),
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

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /runtime payload missing/i)
  assert.equal(existsSync(log), false)
})
