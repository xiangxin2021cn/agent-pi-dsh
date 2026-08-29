import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionTransactionRegistry } from '../src/session-transaction.ts'

test('automation cannot run until a session transaction is explicitly committed', () => {
  let clock = 10
  const registry = createSessionTransactionRegistry<{ projectId: string }>(() => clock++)
  registry.prepare('session-a', { projectId: 'p1' })
  assert.equal(registry.canRun('session-a'), false)
  assert.equal(registry.committed().length, 0)

  const committed = registry.commit('session-a')
  assert.equal(committed.phase, 'committed')
  assert.equal(registry.canRun('session-a'), true)
  assert.deepEqual(registry.committed().map((item) => item.sessionId), ['session-a'])
})

test('transactions are isolated by session and settle explicitly', () => {
  const registry = createSessionTransactionRegistry<{ projectId: string }>(() => 20)
  registry.prepare('session-a', { projectId: 'p1' })
  registry.commit('session-a')
  registry.prepare('session-b', { projectId: 'p2' })
  registry.commit('session-b')

  assert.equal(registry.succeed('session-a').phase, 'succeeded')
  assert.equal(registry.canRun('session-a'), false)
  assert.equal(registry.canRun('session-b'), true)
  assert.equal(registry.fail('session-b', new Error('blocked')).error, 'blocked')
  assert.equal(registry.canRun('session-b'), false)
})

test('session destruction removes every runnable transaction state', () => {
  const registry = createSessionTransactionRegistry<{ projectId: string }>()
  registry.prepare('session-a', { projectId: 'p1' })
  registry.commit('session-a')
  const destroyed = registry.destroy('session-a')

  assert.equal(destroyed?.phase, 'destroyed')
  assert.equal(registry.get('session-a'), undefined)
  assert.equal(registry.canRun('session-a'), false)
})

test('one session cannot start overlapping automation transactions', () => {
  const registry = createSessionTransactionRegistry<{ projectId: string }>()
  registry.prepare('session-a', { projectId: 'p1' })
  assert.throws(() => registry.prepare('session-a', { projectId: 'p2' }), /already active/)
  registry.fail('session-a', 'cancelled')
  assert.doesNotThrow(() => registry.prepare('session-a', { projectId: 'p2' }))
})
