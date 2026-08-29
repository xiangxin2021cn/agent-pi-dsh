export function appendWorkspaceQuery(path, cwd) {
  const separator = String(path).includes('?') ? '&' : '?'
  return `${path}${separator}cwd=${encodeURIComponent(cwd || '')}`
}

export function createAgentPiApiClient(options = {}) {
  const fetchImpl = options.fetchImpl || ((...args) => fetch(...args))
  const setTimer = options.setTimer || ((callback, delay) => setTimeout(callback, delay))
  const clearTimer = options.clearTimer || ((timer) => clearTimeout(timer))
  const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null)
  const urlApi = options.urlApi || (typeof URL !== 'undefined' ? URL : null)

  function api(path, cwd, init) {
    const opts = init || {}
    const timeoutMs = opts.timeoutMs
    const rest = Object.assign({}, opts)
    delete rest.timeoutMs
    const ctrl = rest.signal ? null : new AbortController()
    const timer = timeoutMs ? setTimer(() => { if (ctrl) ctrl.abort() }, timeoutMs) : null
    return fetchImpl(appendWorkspaceQuery(path, cwd), Object.assign({
      headers: { 'content-type': 'application/json' },
    }, rest, {
      signal: rest.signal || (ctrl && ctrl.signal),
    })).then(async (res) => {
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || res.statusText)
      return body
    }).catch((err) => {
      if (err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || err)))) {
        throw new Error(timeoutMs ? '打开文件超时，请改用资源管理器或稍后再试。' : '请求已取消')
      }
      throw err
    }).finally(() => { if (timer) clearTimer(timer) })
  }

  function apiBlob(path, cwd, init) {
    return fetchImpl(appendWorkspaceQuery(path, cwd), {
      headers: { 'content-type': 'application/json' },
      ...init,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || res.statusText)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(disposition)
      const filename = decodeURIComponent((match && (match[1] || match[2])) || 'download')
      return { blob, filename }
    })
  }

  function downloadBlob(blob, filename) {
    if (!documentRef || !urlApi) throw new Error('Download is unavailable outside the desktop renderer.')
    const url = urlApi.createObjectURL(blob)
    const anchor = documentRef.createElement('a')
    anchor.href = url
    anchor.download = filename
    documentRef.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimer(() => urlApi.revokeObjectURL(url), 1500)
  }

  function rawFileUrl(cwd, filePath) {
    return `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd || '')}&path=${encodeURIComponent(filePath || '')}`
  }

  return { api, apiBlob, downloadBlob, rawFileUrl }
}
