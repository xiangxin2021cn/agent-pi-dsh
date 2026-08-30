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

test('only previously committed transactions are restored after a renderer restart', () => {
  const registry = createSessionTransactionRegistry<{ projectId: string }>(() => 40, [
    {
      sessionId: 'session-a',
      phase: 'committed',
      payload: { projectId: 'p1' },
      preparedAt: 10,
      committedAt: 20,
    },
    {
      sessionId: 'session-b',
      phase: 'prepared',
      payload: { projectId: 'p2' },
      preparedAt: 30,
    },
  ])

  assert.equal(registry.canRun('session-a'), true)
  assert.equal(registry.get('session-a')?.committedAt, 20)
  assert.equal(registry.get('session-b'), undefined)
})
