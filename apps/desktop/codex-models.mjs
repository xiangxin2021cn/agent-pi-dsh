import { spawnSync as nodeSpawnSync } from 'node:child_process'

const ESTIMATED_CAPACITY = Object.freeze({
  contextWindow: 262_144,
  maxTokens: 32_768,
})

const OFFICIAL_CAPACITY = new Map([
  ['gpt-5.6-sol', Object.freeze({
    contextWindow: 1_050_000,
    maxTokens: 128_000,
  })],
])

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function capacityField(value, official, field) {
  if (positiveNumber(value)) return [value, 'provider']
  if (official) return [official[field], 'official']
  return [ESTIMATED_CAPACITY[field], 'estimated']
}

export function codexModelFromAppServerOutput(stdout) {
  const messages = String(stdout || '').split(/\r?\n/).flatMap((line) => {
    try { return line.trim() ? [JSON.parse(line)] : [] } catch { return [] }
  })
  const reply = messages.find((message) => message?.id === 2)
  const models = Array.isArray(reply?.result?.data) ? reply.result.data : []
  const selected = models.find(
    (model) => model?.isDefault === true && typeof model?.id === 'string',
  )
  if (!selected) return null

  const official = OFFICIAL_CAPACITY.get(selected.id)
  const [contextWindow, contextWindowSource] = capacityField(
    selected.contextWindow,
    official,
    'contextWindow',
  )
  const [maxTokens, maxTokensSource] = capacityField(
    selected.maxTokens,
    official,
    'maxTokens',
  )
  return {
    id: selected.id,
    contextWindow,
    maxTokens,
    contextWindowSource,
    maxTokensSource,
  }
}

export function probeCodexModel(options) {
  const spawnSync = options.spawnSync ?? nodeSpawnSync
  const input = [
    JSON.stringify({ id: 1, method: 'initialize', params: {
      clientInfo: { name: 'agent-pi-dsh', version: '3.5.3' },
      capabilities: {},
    } }),
    JSON.stringify({ method: 'notifications/initialized', params: {} }),
    JSON.stringify({ id: 2, method: 'model/list', params: {} }),
  ].join('\n') + '\n'
  let result
  try {
    result = spawnSync(options.nodePath, [options.wrapperPath, 'app-server', '--stdio'], {
      input,
      cwd: options.codexHome,
      env: options.env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    })
  } catch {
    return null
  }
  if (result?.error || result?.status !== 0) return null
  return codexModelFromAppServerOutput(result.stdout)
}
