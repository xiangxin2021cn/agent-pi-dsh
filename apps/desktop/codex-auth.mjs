import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { probeCodexModel } from './codex-models.mjs'

const CREDENTIAL_ENV = [
  'OPENAI_API_KEY',
  'OPENAI_ACCESS_TOKEN',
  'CODEX_API_KEY',
  'CODEX_ACCESS_TOKEN',
]

export function resolveCodexWrapper(dshRoot) {
  const packageJson = join(
    dshRoot,
    'packages/subagent/subagent-codex/node_modules/@openai/codex/package.json',
  )
  if (!existsSync(packageJson)) return null
  try {
    const manifest = JSON.parse(readFileSync(packageJson, 'utf8'))
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.codex
    if (typeof bin !== 'string' || !bin) return null
    const wrapper = resolve(dirname(packageJson), bin)
    return existsSync(wrapper) ? wrapper : null
  } catch {
    return null
  }
}

export function parseCodexLoginStatus(result) {
  if (result?.error) return { available: false, state: 'unavailable' }
  const output = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`
  if (result?.status === 0) {
    const method = /chatgpt/i.test(output) ? 'chatgpt' : 'unknown'
    return { available: true, state: 'logged-in', method }
  }
  if (/not logged in/i.test(output)) return { available: true, state: 'logged-out' }
  return { available: false, state: 'unavailable' }
}

function isolatedEnv(baseEnv, codexHome) {
  const env = { ...baseEnv, CODEX_HOME: codexHome }
  for (const name of CREDENTIAL_ENV) delete env[name]
  return env
}

export function createCodexAuthController(options) {
  const spawn = options.spawn ?? nodeSpawn
  const spawnSync = options.spawnSync ?? nodeSpawnSync
  const env = isolatedEnv(options.baseEnv ?? process.env, options.codexHome)
  let loginChild = null
  let loginFailed = false

  const commandOptions = () => ({
    cwd: options.codexHome,
    env,
    encoding: 'utf8',
    windowsHide: true,
  })

  const status = () => {
    mkdirSync(options.codexHome, { recursive: true })
    const loginStatusResult = spawnSync(
      options.nodePath,
      [options.wrapperPath, 'login', 'status'],
      commandOptions(),
    )
    const parsed = parseCodexLoginStatus(loginStatusResult)
    if (parsed.state === 'logged-out' && loginChild?.exitCode === null) {
      return { available: true, state: 'pending' }
    }
    if (parsed.state === 'logged-out' && loginFailed) {
      return { available: true, state: 'error' }
    }
    if (parsed.state !== 'logged-in') return parsed
    const model = probeCodexModel({
      spawnSync,
      nodePath: options.nodePath,
      wrapperPath: options.wrapperPath,
      codexHome: options.codexHome,
      env,
    })
    return model === null ? parsed : { ...parsed, model }
  }

  const login = () => {
    const current = status()
    if (current.state === 'logged-in' || current.state === 'pending') return current
    loginFailed = false
    try {
      loginChild = spawn(
        options.nodePath,
        [options.wrapperPath, 'login'],
        { ...commandOptions(), stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch {
      loginFailed = true
      return { available: false, state: 'unavailable' }
    }
    loginChild.stdout?.resume?.()
    loginChild.stderr?.resume?.()
    loginChild.once('error', () => { loginFailed = true })
    loginChild.once('exit', (code) => {
      loginFailed = code !== 0
    })
    return { available: true, state: 'pending' }
  }

  const logout = () => {
    if (loginChild?.exitCode === null) loginChild.kill()
    loginChild = null
    loginFailed = false
    mkdirSync(options.codexHome, { recursive: true })
    const result = spawnSync(
      options.nodePath,
      [options.wrapperPath, 'logout'],
      commandOptions(),
    )
    return result?.status === 0
      ? { available: true, state: 'logged-out' }
      : { available: false, state: 'unavailable' }
  }

  const dispose = () => {
    if (loginChild?.exitCode === null) loginChild.kill()
    loginChild = null
  }

  return { status, login, logout, dispose }
}
