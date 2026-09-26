export function createProductCapabilities(React) {
  let value = { workbench: false, knowledge: false }
  const listeners = new Set()
  return {
    install() {
      let disposed = false
      let pending = false
      const refresh = async () => {
        if (pending) return
        pending = true
        try {
          const response = await fetch('/api/agent-pi/capabilities')
          if (!response.ok) return
          const next = await response.json()
          if (!disposed && (next.workbench !== value.workbench || next.knowledge !== value.knowledge)) {
            value = { workbench: next.workbench === true, knowledge: next.knowledge === true }
            for (const notify of listeners) notify(value)
          }
        } finally { pending = false }
      }
      const update = () => { void refresh().catch(() => {}) }
      update()
      const timer = setInterval(update, 5000)
      window.addEventListener('focus', update)
      return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', update) }
    },
    use() {
      const [state, setState] = React.useState(value)
      React.useEffect(() => { listeners.add(setState); setState(value); return () => listeners.delete(setState) }, [])
      return state
    },
  }
}
