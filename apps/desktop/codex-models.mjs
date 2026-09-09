import { spawn as nodeSpawn } from 'node:child_process'

const ESTIMATED_CAPACITY = Object.freeze({ contextWindow: 262_144, maxTokens: 32_768 })

function modelFromEntry(entry) {
  if (!entry || entry.hidden === true) return null
  const id = typeof entry.model === 'string' && entry.model.trim() ? entry.model : entry.id
  if (typeof id !== 'string' || !id.trim()) return null
  const result = {
    id,
    displayName: typeof entry.displayName === 'string' && entry.displayName.trim() ? entry.displayName : id,
    isDefault: entry.isDefault === true,
    supportedReasoningEfforts: Array.isArray(entry.supportedReasoningEfforts)
      ? entry.supportedReasoningEfforts.filter((item) => typeof item?.reasoningEffort === 'string')
        .map(({ reasoningEffort, description }) => ({ reasoningEffort, description }))
      : [],
    defaultReasoningEffort: typeof entry.defaultReasoningEffort === 'string' ? entry.defaultReasoningEffort : null,
  }
  for (const field of ['contextWindow', 'maxTokens']) {
    const provided = typeof entry[field] === 'number' && Number.isFinite(entry[field]) && entry[field] > 0
    result[field] = provided ? entry[field] : ESTIMATED_CAPACITY[field]
    result[`${field}Source`] = provided ? 'provider' : 'estimated'
  }
  return result
}

function supportsReasoningEffort(model, effort) {
  return model?.supportedReasoningEfforts?.some((item) => item.reasoningEffort === effort) === true
}

export function codexModelSelection({ models, selectedModel, selectedReasoningEffort = null }) {
  const model = selectedModel
    ? models.find((entry) => entry.id === selectedModel) ?? null
    : models.find((entry) => entry.isDefault) ?? models[0] ?? null
  return {
    models, selectedModel, selectedReasoningEffort, defaultModel: model?.id ?? null, model,
    ...(selectedReasoningEffort && model && !supportsReasoningEffort(model, selectedReasoningEffort)
      ? { reasoningEffortError: '已保存的 Codex 思考等级不适用于当前模型，请重新选择。' }
      : {}),
  }
}

function selectionFromConfig(models, config) {
  return codexModelSelection({
    models,
    selectedModel: typeof config?.model === 'string' && config.model.trim() ? config.model : null,
    selectedReasoningEffort: typeof config?.model_reasoning_effort === 'string' && config.model_reasoning_effort.trim()
      ? config.model_reasoning_effort : null,
  })
}

function queryFailure(code) {
  const error = new Error(code === 'timeout'
    ? 'Codex 模型查询超时，请重试。'
    : '无法读取 Codex 模型信息，请重试或重新登录 ChatGPT。')
  error.code = code
  return error
}

async function withAppServer(options, operation) {
  if (options.signal?.aborted) throw queryFailure('aborted')
  const spawn = options.spawn ?? nodeSpawn
  const child = spawn(options.nodePath, [options.wrapperPath, 'app-server', '--stdio'], {
    cwd: options.codexHome,
    env: options.env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pending = new Map()
  let nextId = 0
  let buffer = ''
  let failure = null
  let closing = false
  const fail = (code) => {
    failure ??= queryFailure(code)
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer)
      reject(failure)
    }
    pending.clear()
  }
  child.once('error', () => fail('process'))
  child.once('close', () => { if (!closing) fail('closed') })
  const onAbort = () => fail('aborted')
  options.signal?.addEventListener('abort', onAbort, { once: true })
  child.stdin.on('error', () => fail('transport'))
  child.stderr.resume()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    if (buffer.length > 2_000_000) return fail('invalid-response')
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { fail('invalid-response'); return }
      const request = pending.get(message?.id)
      if (!request) continue
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (message.error || !Object.hasOwn(message, 'result')) request.reject(queryFailure('rpc'))
      else request.resolve(message.result)
    }
  })
  const request = (method, params) => {
    if (failure) return Promise.reject(failure)
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail('timeout'), options.timeoutMs ?? 15_000)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }
  try {
    await request('initialize', {
      clientInfo: { name: 'agent-pi-dsh', version: '3.6.4' },
      capabilities: {},
    })
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
    return await operation(request)
  } finally {
    closing = true
    options.signal?.removeEventListener('abort', onAbort)
    for (const { timer } of pending.values()) clearTimeout(timer)
    child.stdin.end()
    // Let the official wrapper forward EOF before terminating a stalled server.
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill() }, 1_000)
    timer.unref?.()
    child.once('close', () => clearTimeout(timer))
  }
}

async function listModels(request) {
  const models = new Map()
  const cursors = new Set()
  let cursor = null
  do {
    const page = await request('model/list', { limit: 100, includeHidden: false, cursor })
    if (!Array.isArray(page?.data)) throw queryFailure('invalid-response')
    for (const entry of page.data) {
      const model = modelFromEntry(entry)
      if (model) models.set(model.id, model)
    }
    cursor = page.nextCursor ?? null
    if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursors.has(cursor))) {
      throw queryFailure('invalid-pagination')
    }
    cursors.add(cursor)
  } while (cursor !== null)
  if (models.size === 0) throw queryFailure('empty-catalog')
  return [...models.values()]
}

export async function probeCodexModels(options) {
  return withAppServer(options, async (request) => {
    const models = await listModels(request)
    const { config } = await request('config/read', { includeLayers: false })
    return selectionFromConfig(models, config)
  })
}

export async function setCodexDefaultModel(options, selectedModel) {
  if (selectedModel !== null && (typeof selectedModel !== 'string' || !selectedModel.trim())) {
    throw new TypeError('请选择有效的 Codex 模型。')
  }
  return withAppServer(options, async (request) => {
    const models = await listModels(request)
    if (selectedModel !== null && !models.some((model) => model.id === selectedModel)) {
      throw new Error('所选 Codex 模型已不可用，请刷新模型列表后重新选择。')
    }
    const before = await request('config/read', { includeLayers: false })
    const previous = selectionFromConfig(models, before.config)
    const nextModel = codexModelSelection({ models, selectedModel }).model
    const clearReasoning = previous.selectedReasoningEffort !== null
      && !supportsReasoningEffort(nextModel, previous.selectedReasoningEffort)
    const modelEdit = { keyPath: 'model', value: selectedModel, mergeStrategy: 'replace' }
    if (clearReasoning) {
      await request('config/batchWrite', { edits: [
        modelEdit,
        { keyPath: 'model_reasoning_effort', value: null, mergeStrategy: 'replace' },
      ] })
    } else {
      await request('config/value/write', modelEdit)
    }
    const { config } = await request('config/read', { includeLayers: false })
    if ((config?.model ?? null) !== selectedModel) {
      throw new Error('Codex 模型设置未生效，请检查配置限制后重试。')
    }
    if (clearReasoning && config?.model_reasoning_effort != null) {
      throw new Error('Codex 思考等级设置未生效，请检查配置限制后重试。')
    }
    return selectionFromConfig(models, config)
  })
}

export async function setCodexDefaultReasoningEffort(options, selectedReasoningEffort) {
  if (selectedReasoningEffort !== null && (typeof selectedReasoningEffort !== 'string' || !selectedReasoningEffort.trim())) {
    throw new TypeError('请选择有效的 Codex 思考等级。')
  }
  return withAppServer(options, async (request) => {
    const models = await listModels(request)
    const before = await request('config/read', { includeLayers: false })
    const selected = selectionFromConfig(models, before.config)
    if (selectedReasoningEffort !== null && !supportsReasoningEffort(selected.model, selectedReasoningEffort)) {
      throw new Error('当前 Codex 模型不支持所选思考等级，请刷新后重新选择。')
    }
    await request('config/value/write', {
      keyPath: 'model_reasoning_effort', value: selectedReasoningEffort, mergeStrategy: 'replace',
    })
    const { config } = await request('config/read', { includeLayers: false })
    if ((config?.model_reasoning_effort ?? null) !== selectedReasoningEffort) {
      throw new Error('Codex 思考等级设置未生效，请检查配置限制后重试。')
    }
    return selectionFromConfig(models, config)
  })
}
