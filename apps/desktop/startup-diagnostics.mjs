export function sanitizeStartupLog(value) {
  return String(value)
    .replace(/([?&]token=)[^\s&"']+/gi, '$1<redacted>')
    .split(/\r?\n/).filter(line => !/api.?key|authorization|bearer\s|refresh.?token|access.?token|password|secret/i.test(line))
    .join('\n')
}

export function startupFailureDetail(error, recentOutput, logPath) {
  const text = sanitizeStartupLog(recentOutput)
  const failure = text.split('\n').find(line => /Cannot find (?:package|module)|failed to (?:import|apply) loader entry|Error: dsh:/.test(line))
  return [sanitizeStartupLog(error?.message ?? error), failure, `启动日志：${logPath}`,
    '如果刚升级了插件，可从插件恢复模式检查；不要删除会话或工作文件。'].filter(Boolean).join('\n\n')
}
