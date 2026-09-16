export function scopeUniverViewerUrl(viewerUrl, sessionId) {
  if (!viewerUrl.startsWith('/univer-viewer/')) return viewerUrl
  if (!sessionId) return ''
  const url = new URL(viewerUrl, 'http://localhost')
  url.searchParams.set('sessionId', sessionId)
  return url.pathname + url.search + url.hash
}
