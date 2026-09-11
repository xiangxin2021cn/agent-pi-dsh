export function createAgentTeamsSettings(React) {
  const h = React.createElement
  return function AgentTeamsSettings({ desktop, zh }) {
    const available = typeof desktop?.agentTeamsStatus === 'function' && typeof desktop?.setAgentTeams === 'function'
    const [enabled, setEnabled] = React.useState(false)
    const [busy, setBusy] = React.useState(available)
    const [message, setMessage] = React.useState('')
    React.useEffect(() => {
      if (!available) return
      let disposed = false
      desktop.agentTeamsStatus().then(value => {
        if (!disposed) setEnabled(value.enabled === true)
      }).catch(() => {
        if (!disposed) setMessage(zh ? '无法读取团队协作设置。' : 'Could not load the team setting.')
      }).finally(() => { if (!disposed) setBusy(false) })
      return () => { disposed = true }
    }, [available, desktop, zh])
    const toggle = async () => {
      setBusy(true)
      try {
        const value = await desktop.setAgentTeams(!enabled)
        setEnabled(value.enabled === true)
        setMessage(zh ? '已保存，重启应用后生效。' : 'Saved. Restart the app to apply.')
      } catch {
        setMessage(zh ? '保存失败，请重试。' : 'Could not save. Please retry.')
      } finally { setBusy(false) }
    }
    return h('div', { className: 'ap-codex-card', style: { marginTop: 14 } },
      h('div', { className: 'ap-codex-status' },
        h('strong', null, zh ? 'Agent Teams 团队协作（实验）' : 'Agent Teams (experimental)'),
        h('button', { type: 'button', role: 'switch', className: 'ap-switch' + (enabled ? ' on' : ''),
          'aria-label': zh ? 'Agent Teams 团队协作' : 'Agent Teams', 'aria-checked': enabled,
          disabled: busy || !available, onClick: toggle }, h('span', { className: 'ap-switch-knob' }))),
      h('p', { className: 'ap-sub' }, zh
        ? '默认关闭。开启并重启后，可在对话标题处查看官方团队成员和共享任务板。只有明确要求团队协作时才创建成员；成员共享工作目录。Codex 执行仍作为独立子智能体。'
        : 'Off by default. After enabling and restarting, the conversation header provides the official roster and task board. Teammates are created only when explicitly requested and share the workspace. Codex execution remains a separate subagent.'),
      !available && h('p', { className: 'ap-sub' }, zh ? '此开关需要桌面应用。' : 'This switch requires the desktop app.'),
      message && h('p', { className: 'ap-sub', role: 'status' }, message))
  }
}
