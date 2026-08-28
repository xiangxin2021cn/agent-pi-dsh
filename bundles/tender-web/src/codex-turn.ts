export function buildCodexTurnDelegation(task: string): string {
  const original = String(task || '').trim()
  if (!original) throw new Error('Codex delegation requires a non-empty task')
  return `【Codex 执行模式】
你是 DSH 主智能体。必须立即调用 subagent_codex，将 run_in_background=false；不要先自行完成任务。请把下方用户任务、明确文件路径、必要上下文和验收目标整理成独立委派，等待 Codex 完成，核验实际结果后再向用户汇报。

【用户原始任务】
${original}`
}

export function codexCanRun(status: unknown): boolean {
  const value = status as { available?: unknown; state?: unknown } | null
  return value?.available === true && value.state === 'logged-in'
}
