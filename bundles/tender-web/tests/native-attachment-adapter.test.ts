import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addNativeComposerFiles } from '../src/client/native-attachment-adapter.js'

const files = [{ name: 'drawing.png' }]

test('DSH 0.1.3 draft attachments use the session-addressed composer contract', () => {
  const calls: unknown[][] = []
  const drafts = [{ id: 'draft-1' }]
  const result = addNativeComposerFiles({
    sessionId: 'session-1',
    files,
    conversation: {
      createDrafts(sessionId: string, incoming: unknown[]) {
        calls.push([sessionId, incoming])
        return drafts
      },
      releaseDraftAttachments() {
        assert.fail('accepted drafts must not be released')
      },
    },
    actions: {
      addAttachments(ids: string[]) {
        assert.deepEqual(ids, ['draft-1'])
        return true
      },
    },
  })

  assert.equal(result.status, 'added')
  assert.deepEqual(calls, [['session-1', files]])
})

test('DSH 0.1.3 rejected drafts are released atomically', () => {
  const drafts = [{ id: 'draft-1' }, { id: 'draft-2' }]
  let released: unknown
  const result = addNativeComposerFiles({
    sessionId: 'session-1',
    files,
    conversation: {
      createDrafts: () => drafts,
      releaseDraftAttachments(value: unknown) { released = value },
    },
    actions: { addAttachments: () => false },
  })

  assert.equal(result.status, 'rejected')
  assert.equal(released, drafts)
})

test('DSH 0.1.3 rolls back drafts when composer admission throws', () => {
  const drafts = [{ id: 'draft-1' }]
  let released: unknown
  const error = new Error('composer locked')
  const result = addNativeComposerFiles({
    sessionId: 'session-1',
    files,
    conversation: {
      createDrafts: () => drafts,
      releaseDraftAttachments(value: unknown) { released = value },
    },
    actions: { addAttachments: () => { throw error } },
  })

  assert.equal(result.status, 'error')
  assert.equal(result.error, error)
  assert.equal(released, drafts)
})

test('DSH 0.1.3 contract is not entered without a concrete session id', () => {
  let called = false
  const result = addNativeComposerFiles({
    sessionId: '',
    files,
    conversation: {
      createDrafts: () => { called = true; return [] },
      releaseDraftAttachments() {},
    },
    actions: { addAttachments: () => true },
  })

  assert.equal(result.status, 'unavailable')
  assert.equal(called, false)
})

test('DSH 0.1.2 image drafts remain supported', () => {
  const drafts = [{ id: 'image-1' }]
  const result = addNativeComposerFiles({
    sessionId: 'session-legacy',
    files,
    conversation: {
      createDraftImages(incoming: unknown[]) {
        assert.deepEqual(incoming, files)
        return drafts
      },
      releaseDraftImages() {
        assert.fail('accepted images must not be released')
      },
    },
    actions: {
      addImages(ids: string[]) {
        assert.deepEqual(ids, ['image-1'])
        return true
      },
    },
  })

  assert.equal(result.status, 'added')
})

test('DSH 0.1.2 rolls back images when composer admission throws', () => {
  const drafts = [{ id: 'image-1' }]
  let released: unknown
  const error = new Error('composer locked')
  const result = addNativeComposerFiles({
    sessionId: 'session-legacy',
    files,
    conversation: {
      createDraftImages: () => drafts,
      releaseDraftImages(value: unknown) { released = value },
    },
    actions: { addImages: () => { throw error } },
  })

  assert.equal(result.status, 'error')
  assert.equal(result.error, error)
  assert.equal(released, drafts)
})

test('adapter reports thrown composer failures without falling through to another API generation', () => {
  let legacyCalled = false
  const error = new Error('draft registry unavailable')
  const result = addNativeComposerFiles({
    sessionId: 'session-1',
    files,
    conversation: {
      createDrafts: () => { throw error },
      releaseDraftAttachments() {},
      createDraftImages: () => { legacyCalled = true; return [] },
    },
    actions: {
      addAttachments: () => true,
      addImages: () => true,
    },
  })

  assert.equal(result.status, 'error')
  assert.equal(result.error, error)
  assert.equal(legacyCalled, false)
})
