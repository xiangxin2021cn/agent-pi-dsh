import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { sanitizeStartupLog } from '../apps/desktop/startup-diagnostics.mjs'

assert.equal(process.platform, 'darwin', 'Application startup check requires macOS')
assert.equal(process.arch, 'x64', 'Application startup check requires an Intel runner')
assert.ok(process.argv[2], 'Usage: smoke-macos-intel.mjs <packaged-app-directory>')
const app = resolve(process.argv[2])
const plist = spawnSync('plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], { encoding: 'utf8' })
assert.equal(plist.status, 0, plist.stderr)
const executable = join(app, 'Contents/MacOS', JSON.parse(plist.stdout).CFBundleExecutable)
const runtimeNode = join(app, 'Contents/Resources/runtime/node/node')
const node = spawnSync(runtimeNode, ['-p', 'JSON.stringify({arch:process.arch,version:process.version})'], { encoding: 'utf8', timeout: 20000 })
assert.equal(node.status, 0, node.stderr)
assert.deepEqual(JSON.parse(node.stdout), { arch: 'x64', version: 'v22.20.0' })
const runtime = join(app, 'Contents/Resources/runtime')
const codexHome = mkdtempSync(join(tmpdir(), 'agent-pi-codex-smoke-'))
try {
  for (const manifest of ['product/bundles/tender-host/package.json', 'deepseek-harness/packages/subagent/subagent-codex/package.json']) {
    const wrapper = createRequire(join(runtime, manifest)).resolve('@openai/codex/bin/codex.js')
    const codex = spawn(runtimeNode, [wrapper, '--config', 'features.shell_zsh_fork=false', '--config', 'features.realtime_conversation=false', 'app-server', '--stdio'], {
      env: { ...process.env, CODEX_HOME: codexHome }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Packaged Codex initialization timed out')), 30000)
        let buffer = ''
        const finish = error => { clearTimeout(timeout); error ? reject(error) : resolve() }
        codex.once('error', finish)
        codex.once('exit', () => finish(new Error('Packaged Codex exited before initialization')))
        codex.stdout.on('data', data => {
          buffer += data
          let newline
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
            if (!line.trim()) continue
            try {
              const message = JSON.parse(line)
              if (message.id === 1) finish(message.error || !message.result ? new Error('Packaged Codex initialization failed') : null)
            } catch { finish(new Error('Packaged Codex returned an invalid protocol message')) }
          }
        })
        codex.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agent_pi_compatibility_check', version: '1.0.0' } } }) + '\n')
      })
    } finally {
      if (codex.exitCode === null) codex.kill('SIGTERM')
      await Promise.race([new Promise(resolve => codex.once('exit', resolve)), delay(3000)])
      if (codex.exitCode === null) codex.kill('SIGKILL')
    }
  }
} finally { rmSync(codexHome, { recursive: true, force: true }) }
const electron = spawnSync(executable, ['-p', 'JSON.stringify({arch:process.arch,electron:process.versions.electron})'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 20000,
})
assert.equal(electron.status, 0, electron.stderr)
assert.deepEqual(JSON.parse(electron.stdout), { arch: 'x64', electron: '43.7.11' })

const portServer = createServer()
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve))
const debugPort = portServer.address().port
await new Promise(resolve => portServer.close(resolve))
const child = spawn(executable, ['--disable-gpu', `--remote-debugging-port=${debugPort}`], {
  env: { ...process.env, AGENT_PI_DSH_FORCE_COLD_START: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + sanitizeStartupLog(data)).slice(-20000) })
let childError = null
child.on('error', error => { childError = error })

function inspectPage(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timeout = setTimeout(() => { socket.close(); reject(new Error('Renderer inspection timeout')) }, 5000)
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Renderer inspection failed')) }, { once: true })
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate', params: { returnByValue: true,
        expression: '({title:document.title,ready:document.readyState,textLength:document.body?.innerText?.length||0,host:location.hostname})' },
    })), { once: true })
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timeout)
      socket.close()
      if (message.error || message.result?.exceptionDetails) reject(new Error('Renderer did not evaluate'))
      else resolve(message.result.result.value)
    })
  })
}

let rendered = null
let lastError = null
try {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (childError || child.exitCode !== null) throw childError || new Error(`Desktop exited during startup: ${child.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(3000) })
      const targets = await response.json()
      const target = targets.find(target => target.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\//.test(target.url))
      if (target) {
        const state = await inspectPage(target.webSocketDebuggerUrl)
        if (state.ready === 'complete' && state.host === '127.0.0.1' && state.textLength > 100) { rendered = state; break }
      }
    } catch (error) { lastError = error }
    await delay(500)
  }
  assert.ok(rendered, `Packaged DSH page did not become ready: ${lastError?.message || ''}\n${output}`)
  console.log(JSON.stringify({ passed: true, electron: '43.7.11', node: '22.20.0', architecture: 'x64', renderer: rendered,
    codexInitialization: true,
    limitation: 'Startup was tested on the CI runner, not on macOS Monterey hardware.' }))
} finally {
  if (child.exitCode === null && child.pid) {
    child.kill('SIGTERM')
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)])
    if (child.exitCode === null) {
      spawnSync('pkill', ['-TERM', '-P', String(child.pid)])
      child.kill('SIGKILL')
    }
  }
}
