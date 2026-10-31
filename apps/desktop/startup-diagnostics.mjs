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

export function cadViewerConsoleDiagnostic(details, appUrl) {
  if (details?.level !== 'error') return null
  let source
  try {
    source = new URL(details.sourceId)
    if (source.origin !== new URL(appUrl).origin || !source.pathname.startsWith('/api/agent-pi/cad-viewer/')) return null
  } catch { return null }
  const message = sanitizeStartupLog(String(details.message || '').split(/\r?\n/, 1)[0]).trim().slice(0, 1500)
  if (!/^(?:\[mlightcad-poc\] |Error occurred in conversion stage '[A-Z_]+':)/.test(message)) return null
  return '[cad-renderer] ' + JSON.stringify({
    source: source.pathname.slice(0, 256), line: details.lineNumber,
    code: message.match(/\b(worker_oom|worker_timeout|worker_error|parse_failed|font_load_failed|fetch_failed)\b/)?.[1] || null,
    stage: message.match(/conversion stage '([A-Z_]+)'/)?.[1] || null,
    message,
  })
}

export function rendererGoneDiagnostic(details, { pid, version, electron, chrome }) {
  const exit = details?.exitCode
  const hex = Number.isInteger(exit) ? '0x' + (exit >>> 0).toString(16).padStart(8, '0') : 'unknown'
  return `[renderer] gone reason=${details?.reason} exit=${exit} hex=${hex} pid=${pid} version=${version} electron=${electron} chrome=${chrome}`
}
