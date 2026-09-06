/**
 * Add browser files to the native DSH composer while preserving the 0.1.2
 * image-only contract during the 0.1.3 migration.
 */
export function addNativeComposerFiles({ conversation, actions, sessionId, files }) {
  const list = (files || []).filter(Boolean)
  if (!list.length || !conversation || !actions) return { status: 'unavailable' }

  if (typeof conversation.createDrafts === 'function'
    && typeof conversation.releaseDraftAttachments === 'function'
    && typeof actions.addAttachments === 'function') {
    if (!sessionId) return { status: 'unavailable' }
    let drafts
    let released = false
    const rollback = () => {
      if (!drafts || released) return
      released = true
      conversation.releaseDraftAttachments(drafts)
    }
    try {
      drafts = conversation.createDrafts(sessionId, list)
      if (!actions.addAttachments(drafts.map((draft) => draft.id))) {
        rollback()
        return { status: 'rejected' }
      }
      return { status: 'added' }
    } catch (error) {
      try { rollback() } catch { /* preserve the composer admission error */ }
      return { status: 'error', error }
    }
  }

  if (typeof conversation.createDraftImages === 'function' && typeof actions.addImages === 'function') {
    let images
    let released = false
    const rollback = () => {
      if (!images || released || typeof conversation.releaseDraftImages !== 'function') return
      released = true
      conversation.releaseDraftImages(images)
    }
    try {
      images = conversation.createDraftImages(list)
      if (!actions.addImages(images.map((image) => image.id))) {
        rollback()
        return { status: 'rejected' }
      }
      return { status: 'added' }
    } catch (error) {
      try { rollback() } catch { /* preserve the composer admission error */ }
      return { status: 'error', error }
    }
  }

  return { status: 'unavailable' }
}
