/**
 * Request-scoped "drain probe" context.
 *
 * A deferred plugin mutation captures its immutable target by replaying the
 * route's ordinary validation before the operation starts waiting. That replay
 * must not leave a trace: no log lines, no cache invalidation, no profile
 * writes. AsyncLocalStorage is what makes the suppression request-scoped —
 * a module-level boolean would also silence concurrent status reads and update
 * checks for as long as the probe waits on the registry.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage<true>()

/** Whether the current async call chain is a drain probe. */
export function inProbe(): boolean {
  return storage.getStore() === true
}

/** Run one operation with probe-only side effects suppressed. */
export function runInProbe<T>(operation: () => T): T {
  return storage.run(true, operation)
}
