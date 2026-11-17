import { DEFAULT_UPDATE_CHECK_INTERVAL_HOURS, isUpdateCheckIntervalHours } from "./update-notification-settings.js";
export const UPDATE_CHECK_START_DELAY_MS = 30_000;
export const UPDATE_CHECK_INTERVAL_MS = DEFAULT_UPDATE_CHECK_INTERVAL_HOURS * 60 * 60_000;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 30 * 60_000;
/** Start one profile-scoped timer; callers own persistence of the preferences. */
export function createUpdateNotificationMonitor(deps) {
    let enabled = deps.enabled;
    let intervalHours = isUpdateCheckIntervalHours(deps.intervalHours) ? deps.intervalHours : DEFAULT_UPDATE_CHECK_INTERVAL_HOURS;
    let disposed = false;
    let timer;
    let nextCheckAt = null;
    let checkedAt = null;
    let lastSuccessAt = null;
    let error = null;
    let stale = false;
    let failures = 0;
    let updates = {};
    let identity = deps.inventory();
    let pending = null;
    let pendingForced = false;
    let queuedForce = null;
    const reconcile = () => {
        const current = deps.inventory();
        if (current.context !== identity.context) {
            updates = {};
            checkedAt = null;
            lastSuccessAt = null;
            error = null;
            stale = true;
        }
        else {
            const kept = {};
            for (const [name, status] of Object.entries(updates)) {
                if (current.packages[name] !== undefined && current.packages[name] === identity.packages[name])
                    kept[name] = status;
                else
                    stale = true;
            }
            if (Object.keys(current.packages).some(name => current.packages[name] !== identity.packages[name]))
                stale = true;
            updates = kept;
        }
        identity = current;
        return current;
    };
    const stopTimer = () => {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = undefined;
        nextCheckAt = null;
    };
    const schedule = (delay) => {
        stopTimer();
        if (disposed || !enabled)
            return;
        nextCheckAt = Date.now() + delay;
        timer = setTimeout(() => { void check(stale); }, delay);
        timer.unref?.();
    };
    const nextDelay = () => failures > 0
        ? Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(failures - 1, 5))
        : intervalHours * 60 * 60_000;
    const check = (force = false) => {
        if (disposed)
            return Promise.resolve({ ...updates });
        if (pending !== null) {
            if (!force || pendingForced)
                return pending;
            // A manual refresh arriving during a cache-eligible read must still
            // bypass that cache, once. Several such callers share the follow-up.
            queuedForce ??= pending.then(() => check(true)).finally(() => { queuedForce = null; });
            return queuedForce;
        }
        stopTimer();
        const started = reconcile();
        pendingForced = force || stale;
        // Scheduling into a microtask also makes simultaneous callers share the
        // promise before input gathering starts.
        pending = Promise.resolve().then(async () => {
            try {
                const result = await deps.check(pendingForced);
                if (disposed)
                    return { ...updates };
                const current = reconcile();
                const next = { ...updates };
                let incomplete = result.error !== undefined;
                for (const [name, status] of Object.entries(result.updates)) {
                    if (current.context !== started.context || current.packages[name] === undefined
                        || current.packages[name] !== started.packages[name]) {
                        incomplete = true;
                        continue;
                    }
                    if (status.checkFailed === true || status.checkError !== undefined) {
                        incomplete = true;
                        next[name] = { ...(updates[name] ?? status), checkFailed: true, checkError: 'unavailable',
                            ...(status.sourceMigration === undefined ? {} : { sourceMigration: status.sourceMigration }) };
                    }
                    else {
                        next[name] = status;
                    }
                }
                if (Object.keys(current.packages).some(name => result.updates[name] === undefined
                    || current.context !== started.context || current.packages[name] !== started.packages[name]))
                    incomplete = true;
                updates = next;
                checkedAt = Date.now();
                stale = incomplete;
                error = incomplete ? result.error ?? 'Some plugin updates could not be checked. Try again later.' : null;
                if (!incomplete)
                    lastSuccessAt = checkedAt;
                failures = incomplete ? failures + 1 : 0;
            }
            catch {
                if (disposed)
                    return { ...updates };
                reconcile();
                updates = Object.fromEntries(Object.entries(updates).map(([name, status]) => [name, { ...status, checkFailed: true, checkError: 'unavailable' }]));
                checkedAt = Date.now();
                stale = true;
                error = 'Plugin updates could not be checked. Try again later.';
                failures += 1;
            }
            finally {
                pending = null;
                if (!disposed)
                    schedule(nextDelay());
            }
            return { ...updates };
        });
        return pending;
    };
    schedule(UPDATE_CHECK_START_DELAY_MS);
    return {
        snapshot: () => {
            reconcile();
            return {
                enabled, intervalHours, checking: pending !== null, checkedAt, lastSuccessAt, nextCheckAt,
                stale, error, updates: { ...updates }, boot: deps.boot, ...deps.preferences(),
                ...(deps.profileKey === undefined ? {} : { profileKey: deps.profileKey }),
            };
        },
        check,
        setEnabled: value => {
            if (enabled === value || disposed)
                return;
            enabled = value;
            stopTimer();
            if (enabled && pending === null)
                schedule(UPDATE_CHECK_START_DELAY_MS);
        },
        setIntervalHours: value => {
            if (!isUpdateCheckIntervalHours(value) || intervalHours === value || disposed)
                return;
            intervalHours = value;
            // Keep a pending check single-flight; its completion uses the newest
            // choice. Changing a disabled monitor never opts the user in.
            if (pending === null)
                schedule(checkedAt === null ? UPDATE_CHECK_START_DELAY_MS : nextDelay());
        },
        dispose: () => {
            disposed = true;
            stopTimer();
        },
    };
}
