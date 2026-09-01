import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  attachmentTransactionIdFromMessage,
  cancelPendingVisionContext,
  commitPendingVisionContext,
  pendingVisionTransactionStatus,
  pendingVisionContextForTransaction,
  peekPendingVisionContext,
  readVisionImages,
  resetPendingVisionContext,
  takePendingVisionContext,
} from '../src/attachment-context.ts'
import { registerPrompt } from '../src/prompt.ts'

function transactionMarker(transactionId: string): string {
  return `<!--agent-pi-attachment-tx:${encodeURIComponent(transactionId)}-->`
}

function workspaceWithFile(name: string): { cwd: string; path: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-attach-'))
  const path = join(cwd, name)
  writeFileSync(path, 'price')
  return { cwd, path }
}

test('pending attachment context stays on the owning session', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('N.003-010-2017-3 Pricing Schedule.xlsx')
  const b = workspaceWithFile('other.xlsx')
  await readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    files: [{ name: 'N.003-010-2017-3 Pricing Schedule.xlsx', path: a.path, kind: 'file' }],
  })
  assert.match(peekPendingVisionContext('session-a'), /Pricing Schedule/)
  assert.equal(peekPendingVisionContext('session-b'), '')
  assert.equal(takePendingVisionContext('session-b', b.cwd), '')
  assert.match(takePendingVisionContext('session-a', a.cwd), /Pricing Schedule/)
  assert.equal(peekPendingVisionContext('session-a'), '')
})

test('a later session assembly cannot consume another workspace stash', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('secret.xlsx')
  const b = workspaceWithFile('deck.pptx')
  await readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    files: [{ name: 'secret.xlsx', path: a.path, kind: 'file' }],
  })
  assert.equal(takePendingVisionContext('session-a', b.cwd), '')
  assert.equal(peekPendingVisionContext('session-a'), '')
})

test('paths outside the session cwd are rejected', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('inside.xlsx')
  const b = workspaceWithFile('outside.xlsx')
  await assert.rejects(() => readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    files: [{ name: 'outside.xlsx', path: b.path, kind: 'file' }],
  }), /outside the workspace/)
  assert.equal(peekPendingVisionContext('session-a'), '')
})

test('a folder pointer is stashed as a directory path, even outside cwd', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('inside.xlsx')
  const outside = mkdtempSync(join(tmpdir(), 'ap-folder-'))
  await readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    folders: [{ name: '土耳其项目资料', path: outside }],
  })
  const text = peekPendingVisionContext('session-a')
  assert.match(text, /pointed at these folders/)
  assert.match(text, /土耳其项目资料/)
  assert.match(text, /Do not copy or upload the tree/)
})

test('stash requires sessionId and absolute cwd', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('file.xlsx')
  await assert.rejects(() => readVisionImages({
    cwd: a.cwd,
    files: [{ name: 'file.xlsx', path: a.path, kind: 'file' }],
  }), /sessionId is required/)
  await assert.rejects(() => readVisionImages({
    sessionId: 'session-a',
    cwd: 'relative',
    files: [{ name: 'file.xlsx', path: a.path, kind: 'file' }],
  }), /cwd is required/)
})

test('transaction cancellation cannot clear a newer attachment stash in the same session', async () => {
  resetPendingVisionContext()
  const workspace = workspaceWithFile('scope.pdf')
  await readVisionImages({
    sessionId: 'session-a',
    transactionId: 'attachment-turn-old',
    cwd: workspace.cwd,
    files: [{ name: 'scope.pdf', path: workspace.path, kind: 'file' }],
  })
  await readVisionImages({
    sessionId: 'session-a',
    transactionId: 'attachment-turn-new',
    cwd: workspace.cwd,
    files: [{ name: 'scope.pdf', path: workspace.path, kind: 'file' }],
  })

  assert.equal(cancelPendingVisionContext('session-a', 'attachment-turn-old'), true)
  assert.equal(commitPendingVisionContext('session-a', 'attachment-turn-old'), false)
  assert.match(peekPendingVisionContext('session-a'), /scope\.pdf/)
  assert.equal(cancelPendingVisionContext('session-a', 'attachment-turn-new'), true)
  assert.equal(peekPendingVisionContext('session-a'), '')
})

test('prepared attachment context stays invisible until a matching claimed message activates it', async () => {
  resetPendingVisionContext()
  const workspace = workspaceWithFile('prepared.pdf')
  await readVisionImages({
    sessionId: 'session-prepared',
    transactionId: 'attachment-turn-prepared',
    cwd: workspace.cwd,
    files: [{ name: 'prepared.pdf', path: workspace.path, kind: 'file' }],
  })

  assert.equal(takePendingVisionContext('session-prepared', workspace.cwd), '')
  assert.equal(commitPendingVisionContext('session-prepared', 'attachment-turn-prepared'), true)
  assert.equal(takePendingVisionContext('session-prepared', workspace.cwd), '')
})

test('pre-step injects attachment instructions only for one claimed user marker owning the committed row', async () => {
  resetPendingVisionContext()
  const listeners = new Map<string, (...args: any[]) => unknown>()
  const created: unknown[] = []
  registerPrompt({
    on: (event, listener) => { listeners.set(event, listener) },
    systemPrompt: {
      section: () => undefined,
      context: () => undefined,
    },
  }, (input) => {
    const message = { id: `plugin-${created.length + 1}`, ...input }
    created.push(message)
    return message
  })
  const preStep = listeners.get('agent/pre-step')
  const claimed = listeners.get('agent/inbox/claimed')
  const sessionEvent = listeners.get('session/event')
  const disposed = listeners.get('agent/disposed')
  assert.ok(preStep)
  assert.ok(claimed)
  assert.ok(sessionEvent)
  assert.ok(disposed)
  const workspace = workspaceWithFile('claimed.pdf')
  const transactionId = 'attachment-turn-claimed'
  const agent = { session: { id: 'session-claimed', header: { cwd: workspace.cwd } } }
  await readVisionImages({
    sessionId: 'session-claimed',
    transactionId,
    cwd: workspace.cwd,
    files: [{ name: 'claimed.pdf', path: workspace.path, kind: 'file' }],
  })
  const matchingMarker = {
    id: 'message-with-matching-marker',
    content: [{ type: 'text', text: `处理附件\n${transactionMarker(transactionId)}` }],
    source: { kind: 'user' },
  }
  let nextCalls = 0
  assert.equal(commitPendingVisionContext('session-claimed', transactionId), true)

  const noMarker = {
    id: 'message-without-marker',
    content: [{ type: 'text', text: '普通消息' }],
    source: { kind: 'user' },
  }
  assert.equal(attachmentTransactionIdFromMessage(noMarker), '')
  assert.deepEqual(await preStep({ agent, messages: [noMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [noMarker] }
  }), { kind: 'enter', messages: [noMarker] })
  assert.equal(nextCalls, 1)

  const wrongMarker = {
    id: 'message-with-wrong-marker',
    content: [{ type: 'text', text: `错误事务\n${transactionMarker('attachment-turn-other')}` }],
    source: { kind: 'user' },
  }
  assert.equal(attachmentTransactionIdFromMessage(wrongMarker), 'attachment-turn-other')
  assert.deepEqual(await preStep({ agent, messages: [wrongMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [wrongMarker] }
  }), { kind: 'reject' })
  assert.equal(nextCalls, 2)

  const pluginMarker = {
    id: 'plugin-marker',
    content: [{ type: 'text', text: transactionMarker(transactionId) }],
    source: { kind: 'plugin', plugin: 'other', form: 'instructions' },
  }
  assert.equal(attachmentTransactionIdFromMessage(pluginMarker), '')
  assert.deepEqual(await preStep({ agent, messages: [pluginMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [pluginMarker] }
  }), { kind: 'reject' })
  assert.equal(nextCalls, 2)

  const secondMarker = {
    id: 'second-marker',
    content: [{ type: 'text', text: transactionMarker('attachment-turn-third') }],
    source: { kind: 'user' },
  }
  assert.deepEqual(await preStep({ agent, messages: [wrongMarker, secondMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [wrongMarker, secondMarker] }
  }), { kind: 'reject' })
  assert.equal(nextCalls, 2)

  assert.equal(attachmentTransactionIdFromMessage(matchingMarker), transactionId)
  claimed({ agent, message: matchingMarker, turn: 7 })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'claimed')

  const first = await preStep({ agent, messages: [matchingMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [matchingMarker] }
  }) as { kind: string; messages: Array<{ id?: string; source?: { kind?: string; plugin?: string; form?: string }; content?: Array<{ text?: string }> }> }
  assert.equal(first.kind, 'enter')
  assert.equal(first.messages[0], matchingMarker)
  assert.equal(first.messages.length, 2)
  assert.deepEqual(first.messages[1]?.source, { kind: 'plugin', plugin: 'tender-host', form: 'instructions' })
  assert.match(first.messages[1]?.content?.[0]?.text || '', /claimed\.pdf/)
  assert.equal(nextCalls, 3)

  // Pre-step preparation is read-only; a later wrapper can still reject safely.
  const second = await preStep({ agent, messages: [matchingMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [matchingMarker] }
  }) as { kind: string; messages: Array<{ id?: string; source?: { kind?: string; plugin?: string; form?: string }; content?: Array<{ text?: string }> }> }
  assert.equal(second.kind, 'enter')
  assert.equal(nextCalls, 4)

  sessionEvent(agent.session, { type: 'step/start', data: { turn: 7, step: 1 } })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'claimed')
  sessionEvent(agent.session, { type: 'step/end', data: { turn: 7, step: 1 } })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'claimed')

  const deliveryMessage = second.messages[1]!
  assert.ok(deliveryMessage.id)
  sessionEvent(agent.session, {
    type: 'user/message',
    data: { ...deliveryMessage, source: { kind: 'user' } },
  })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'claimed')
  sessionEvent(agent.session, {
    type: 'user/message',
    data: { ...deliveryMessage, source: { kind: 'plugin', plugin: 'other', form: 'instructions' } },
  })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'claimed')
  sessionEvent(agent.session, {
    type: 'user/message',
    data: { ...deliveryMessage, id: 'different-message-id' },
  })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'claimed')
  sessionEvent(agent.session, { type: 'user/message', data: deliveryMessage })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'delivered')
  sessionEvent(agent.session, { type: 'user/message', data: deliveryMessage })
  assert.equal(pendingVisionTransactionStatus('session-claimed', transactionId).state, 'delivered')

  const cwdMismatch = { session: { id: 'session-claimed', header: { cwd: mkdtempSync(join(tmpdir(), 'ap-other-')) } } }
  assert.deepEqual(await preStep({ agent: cwdMismatch, messages: [matchingMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [matchingMarker] }
  }), { kind: 'reject' })
  assert.equal(nextCalls, 5)

  assert.deepEqual(await preStep({ agent, messages: [matchingMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [] }
  }), { kind: 'reject' })
  assert.equal(nextCalls, 6)

  disposed({ agent })
  assert.equal(peekPendingVisionContext('session-claimed'), '')
  assert.deepEqual(await preStep({ agent, messages: [matchingMarker] }, async () => {
    nextCalls += 1
    return { kind: 'enter', messages: [matchingMarker] }
  }), { kind: 'reject' })
  assert.equal(nextCalls, 7)
})

test('pre-step keeps replacement attachment transactions isolated within one session', async () => {
  resetPendingVisionContext()
  const listeners = new Map<string, (...args: any[]) => unknown>()
  let deliverySequence = 0
  registerPrompt({
    on: (event, listener) => { listeners.set(event, listener) },
    systemPrompt: { section: () => undefined, context: () => undefined },
  }, (input) => ({ id: `plugin-instructions-${++deliverySequence}`, ...input }))
  const preStep = listeners.get('agent/pre-step')
  const claimed = listeners.get('agent/inbox/claimed')
  const sessionEvent = listeners.get('session/event')
  assert.ok(preStep)
  assert.ok(claimed)
  assert.ok(sessionEvent)

  const workspace = workspaceWithFile('old-claimed.pdf')
  const newPath = join(workspace.cwd, 'new-claimed.pdf')
  writeFileSync(newPath, 'new price')
  const agent = { session: { id: 'session-replaced-pre-step', header: { cwd: workspace.cwd } } }
  const oldId = 'attachment-turn-old-claimed'
  const newId = 'attachment-turn-new-claimed'
  await readVisionImages({
    sessionId: agent.session.id,
    transactionId: oldId,
    cwd: workspace.cwd,
    files: [{ name: 'old-claimed.pdf', path: workspace.path, kind: 'file' }],
  })
  assert.equal(commitPendingVisionContext(agent.session.id, oldId), true)
  await readVisionImages({
    sessionId: agent.session.id,
    transactionId: newId,
    cwd: workspace.cwd,
    files: [{ name: 'new-claimed.pdf', path: newPath, kind: 'file' }],
  })
  const oldMessage = {
    id: 'old-message',
    content: [{ type: 'text', text: transactionMarker(oldId) }],
    source: { kind: 'user' },
  }
  const newMessage = {
    id: 'new-message',
    content: [{ type: 'text', text: transactionMarker(newId) }],
    source: { kind: 'user' },
  }
  assert.equal(commitPendingVisionContext(agent.session.id, newId), true)

  claimed({ agent, message: oldMessage, turn: 1 })
  const acceptedOld = await preStep({ agent, messages: [oldMessage] }, async () => ({ kind: 'enter', messages: [oldMessage] })) as {
    kind: string
    messages: Array<{ id?: string; source?: { kind?: string; plugin?: string; form?: string }; content?: Array<{ text?: string }> }>
  }
  assert.equal(acceptedOld.kind, 'enter')
  assert.equal(acceptedOld.messages.length, 2)
  assert.match(acceptedOld.messages[1]?.content?.[0]?.text || '', /old-claimed\.pdf/)
  assert.doesNotMatch(acceptedOld.messages[1]?.content?.[0]?.text || '', /new-claimed\.pdf/)
  sessionEvent(agent.session, { type: 'step/start', data: { turn: 1, step: 1 } })
  assert.equal(pendingVisionTransactionStatus(agent.session.id, oldId).state, 'claimed')
  sessionEvent(agent.session, { type: 'user/message', data: acceptedOld.messages[1] })
  assert.equal(pendingVisionTransactionStatus(agent.session.id, oldId).state, 'delivered')

  claimed({ agent, message: newMessage, turn: 2 })
  const acceptedNew = await preStep({ agent, messages: [newMessage] }, async () => ({ kind: 'enter', messages: [newMessage] })) as {
    kind: string
    messages: Array<{ id?: string; source?: { kind?: string; plugin?: string; form?: string }; content?: Array<{ text?: string }> }>
  }
  assert.equal(acceptedNew.kind, 'enter')
  assert.equal(acceptedNew.messages.length, 2)
  assert.match(acceptedNew.messages[1]?.content?.[0]?.text || '', /new-claimed\.pdf/)
  assert.doesNotMatch(acceptedNew.messages[1]?.content?.[0]?.text || '', /old-claimed\.pdf/)
  sessionEvent(agent.session, { type: 'user/message', data: acceptedOld.messages[1] })
  assert.equal(pendingVisionTransactionStatus(agent.session.id, newId).state, 'claimed')
  sessionEvent(agent.session, {
    type: 'user/message',
    data: { ...acceptedNew.messages[1], source: { kind: 'plugin', plugin: 'other', form: 'instructions' } },
  })
  assert.equal(pendingVisionTransactionStatus(agent.session.id, newId).state, 'claimed')
  sessionEvent(agent.session, { type: 'turn/end', data: { turn: 2, reason: { kind: 'blocked' } } })
  assert.equal(pendingVisionTransactionStatus(agent.session.id, oldId).state, 'delivered')
  assert.equal(pendingVisionTransactionStatus(agent.session.id, newId).state, 'failed')
})

test('each transaction commits only its own prepared attachment row', async () => {
  resetPendingVisionContext()
  const workspace = workspaceWithFile('old.pdf')
  const newerPath = join(workspace.cwd, 'new.pdf')
  writeFileSync(newerPath, 'new price')
  await readVisionImages({
    sessionId: 'session-replaced',
    transactionId: 'attachment-turn-old',
    cwd: workspace.cwd,
    files: [{ name: 'old.pdf', path: workspace.path, kind: 'file' }],
  })
  await readVisionImages({
    sessionId: 'session-replaced',
    transactionId: 'attachment-turn-new',
    cwd: workspace.cwd,
    files: [{ name: 'new.pdf', path: newerPath, kind: 'file' }],
  })

  assert.equal(commitPendingVisionContext('session-replaced', 'attachment-turn-old'), true)
  assert.match(pendingVisionContextForTransaction('session-replaced', 'attachment-turn-old', workspace.cwd), /old\.pdf/)
  assert.equal(pendingVisionContextForTransaction('session-replaced', 'attachment-turn-new', workspace.cwd), '')
  assert.equal(commitPendingVisionContext('session-replaced', 'attachment-turn-new'), true)
  assert.equal(takePendingVisionContext('session-replaced', workspace.cwd), '')
  assert.match(pendingVisionContextForTransaction('session-replaced', 'attachment-turn-new', workspace.cwd), /new\.pdf/)
  assert.doesNotMatch(pendingVisionContextForTransaction('session-replaced', 'attachment-turn-old', workspace.cwd), /new\.pdf/)
})
