import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publishScript = join(root, 'scripts', 'publish-win-and-trigger-platforms.ps1')
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function writeSha256(path) {
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
  writeFileSync(`${path}.sha256`, `${hash}  ${basename(path)}\n`)
}

test('v3 releases dispatch the runtime-payload desktop asset workflow', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-pi-publish-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))

  const log = join(fixture, 'gh.log')
  const installer = join(fixture, 'Agent-Pi-DSH-3.4.0-x64.exe')
  const payload = join(fixture, 'runtime-payload-3.4.0.tar.gz')
  writeFileSync(installer, 'fixture')
  writeFileSync(payload, 'payload')
  writeSha256(installer)
  writeSha256(payload)
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
  writeSha256(installer)
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

test('v3 release refuses to upload when an asset checksum does not match', (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-pi-publish-bad-checksum-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const log = join(fixture, 'gh.log')
  const installer = join(fixture, 'Agent-Pi-DSH-3.4.0-x64.exe')
  writeFileSync(installer, 'fixture')
  writeFileSync(`${installer}.sha256`, `${'0'.repeat(64)}  ${basename(installer)}\n`)
  writeFileSync(join(fixture, 'gh.cmd'), '@echo off\r\n>>"%GH_LOG%" echo %*\r\nexit /b 0\r\n')

  const result = spawnSync(powershell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', publishScript,
    '-Tag', 'v3.4.0', '-Installer', installer,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GH_LOG: log, Path: `${fixture};${process.env.Path ?? ''}`, PATH: `${fixture};${process.env.PATH ?? ''}` },
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /does not match its SHA256 file/)
  assert.equal(existsSync(log), false)
})
