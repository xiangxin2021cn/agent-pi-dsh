const MAX_STDOUT_TAIL = 16 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function isAuthenticatedDshWebUrl(value, expectedPort) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'http:'
      && LOOPBACK_HOSTS.has(url.hostname)
      && Number(url.port) === Number(expectedPort)
      && Boolean(url.searchParams.get('token')?.trim())
  } catch {
    return false
  }
}

export function createDshWebUrlTracker(expectedPort) {
  let tail = ''
  return {
    push(chunk) {
      tail = (tail + String(chunk || '')).slice(-MAX_STDOUT_TAIL)
      const matches = [...tail.matchAll(/dsh web:\s*(https?:\/\/[^\s\u001b]+)/gi)]
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const candidate = matches[index][1]
        if (isAuthenticatedDshWebUrl(candidate, expectedPort)) return new URL(candidate).toString()
      }
      return null
    },
  }
}
