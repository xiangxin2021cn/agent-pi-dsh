type CodexModel = {
  id: string
  defaultReasoningEffort?: string | null
  supportedReasoningEfforts?: Array<{ reasoningEffort: string }>
}

type CodexStatus = {
  models?: CodexModel[]
  model?: CodexModel | null
  modelError?: string
  defaultModel?: string | null
  selectedReasoningEffort?: string | null
}

export function codexTurnModel(status: CodexStatus, selectedModel?: string | null): CodexModel | null {
  return status.models?.find((model) => model.id === (selectedModel || status.defaultModel))
    ?? (!selectedModel ? status.model ?? null : null)
}

export function codexSupportsEffort(model: CodexModel | null, effort?: string | null): boolean {
  return !!effort && model?.supportedReasoningEfforts?.some((item) => item.reasoningEffort === effort) === true
}

export function resolveCodexTurnSelection(status: CodexStatus, selectedModel?: string | null, selectedEffort?: string | null) {
  const model = codexTurnModel(status, selectedModel)
  if (!selectedModel && status.modelError) throw new Error('无法确认默认 Codex 模型，请刷新模型列表或选择可用模型后重试。')
  if (selectedModel && !model) throw new Error('所选 Codex 模型当前不可用，请刷新模型列表并重新选择。')
  if (selectedEffort && !codexSupportsEffort(model, selectedEffort)) {
    throw new Error('所选 Codex 思考等级当前不可用，请刷新模型列表并重新选择。')
  }
  // An override model must not inherit an incompatible effort from the saved default model.
  const inherited = codexSupportsEffort(model, status.selectedReasoningEffort)
    ? status.selectedReasoningEffort
    : codexSupportsEffort(model, model?.defaultReasoningEffort) ? model?.defaultReasoningEffort : null
  return { model: selectedModel || status.defaultModel || null, reasoningEffort: selectedEffort || inherited || null }
}

export function buildCodexTurnDelegation(task: string, model?: string | null, reasoningEffort?: string | null): string {
  const original = String(task || '').trim()
  if (!original) throw new Error('Codex delegation requires a non-empty task')
  const modelInstruction = model
    ? `\n本次 Codex 模型由用户指定：调用 subagent_codex 时必须设置 model=${JSON.stringify(model)}，不要替换为其他模型。`
    : ''
  const effortInstruction = reasoningEffort
    ? `\n本次 Codex 思考等级：调用 subagent_codex 时必须设置 reasoningEffort=${JSON.stringify(reasoningEffort)}。`
    : ''
  return `【Codex 执行模式】
你是 DSH 主智能体。必须立即调用 subagent_codex，将 run_in_background=false；不要先自行完成任务。请把下方用户任务、明确文件路径、必要上下文和验收目标整理成独立委派，等待 Codex 完成，核验实际结果后再向用户汇报。${modelInstruction}${effortInstruction}

【用户原始任务】
${original}`
}

export function codexCanRun(status: unknown): boolean {
  const value = status as { available?: unknown; state?: unknown } | null
  return value?.available === true && value.state === 'logged-in'
}
