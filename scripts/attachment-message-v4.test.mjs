import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { registerPrompt } from '../bundles/tender-host/src/prompt.ts'
import { readVisionImages, commitPendingVisionContext, pendingVisionTransactionStatus, resetPendingVisionContext } from '../bundles/tender-host/src/attachment-context.ts'
import { createUserMessage } from '../vendor/deepseek-harness/packages/llm/llm/lib/index.js'
import { sessionFormatCatalog } from '../vendor/deepseek-harness/packages/session/session-format-catalog/lib/index.js'

for (const imageCount of [0, 2]) test(`PDF and ${imageCount} images survive official V4 encode/restore before delivery acknowledgement`, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'agent-pi-v4-attachment-'))
  resetPendingVisionContext()
  try {
    const file = join(cwd, 'notice.pdf')
    writeFileSync(file, 'attachment transaction fixture')
    const id = 'attachment-v4', transactionId = `pdf-${imageCount}-images`
    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    const images = Array.from({ length: imageCount }, (_, i) => {
      const name = `site-${i + 1}.png`, path = join(cwd, name)
      writeFileSync(path, imageBytes)
      return { name, path }
    })
    const blocks = images.map(({ name }) => ({ type: 'image', attachment: {
      attachmentId: createHash('sha256').update(imageBytes).digest('hex'),
      name, mediaType: 'image/png', bytes: imageBytes.length, width: 1, height: 1,
    } }))
    const agent = { session: { id, header: { cwd } } }
    const listeners = new Map()
    registerPrompt({ on: (name, fn) => listeners.set(name, fn), systemPrompt: { section() {}, context() {} } }, createUserMessage)
    await readVisionImages({ sessionId: id, transactionId, cwd, images, files: [{ name: 'notice.pdf', path: file, kind: 'file' }] })
    assert.equal(commitPendingVisionContext(id, transactionId), true)
    const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: `Read the notice\n<!--agent-pi-attachment-tx:${encodeURIComponent(transactionId)}-->` }, ...blocks] })
    listeners.get('agent/inbox/claimed')({ agent, message: user, turn: 1 })
    const decision = await listeners.get('agent/pre-step')({ agent, messages: [user] }, async () => ({ kind: 'enter', messages: [user] }))
    assert.equal(decision.kind, 'enter')
    assert.equal(decision.messages.length, 2)
    const header = { type: 'session', version: 4, id, createdAt: 1, delegationDepth: 0, isSeeded: false }
    const restore = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })
    for (const [seq, message] of decision.messages.entries()) {
      const event = { type: 'user/message', seq, time: 1, surfaceOp: 'append', data: message }
      const encoded = sessionFormatCatalog.encodeCurrentEvent(event)
      restore.decodeRow(encoded)
      listeners.get('session/event')(agent.session, event)
    }
    const artifact = restore.finish()
    assert.equal(artifact.events.length, 2)
    assert.deepEqual(artifact.events[0].data.content.filter(block => block.type === 'image'), blocks)
    assert.match(JSON.stringify(artifact.events[1].data), /notice\.pdf/)
    assert.equal(pendingVisionTransactionStatus(id, transactionId).state, 'delivered')
  } finally {
    resetPendingVisionContext()
    rmSync(cwd, { recursive: true, force: true })
  }
})
