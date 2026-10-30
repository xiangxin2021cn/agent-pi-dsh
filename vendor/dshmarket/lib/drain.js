/**
 * Host-owned coordinator for Agent-safe deferred plugin mutations (#411).
 *
 * The safety invariant is #199's: plugin files must not be replaced or
 * removed while an Agent can still execute a turn against them. The market
 * already refuses such a mutation; this module removes the dead end by
 * waiting at DSH's public maintenance boundary instead.
 *
 * The mechanism is deliberately narrow. `runMaintenance()` claims a truly
 * idle Agent synchronously and latches later inbox work until the task
 * settles, so there is no poll-then-race window between "observed idle" and
 * pnpm. Existing turns are allowed to finish; nothing here calls
 * `Agent.cancel()`.
 *
 * One process-local coordinator owns one deferred operation at a time, every
 * maintenance hold, and the operation record the browser projects. The record
 * carries counts and ids only — never prompts, transcripts, tool input, or
 * paths (FR-11).
 */
import { drainableAgent } from "./agents.js";
import { redactHomePaths } from "./log-redaction.js";
/** A probe (or an ordinary route replay) refused the request before mutation. */
export class DrainRefusal extends Error {
    status;
    payload;
    constructor(status, payload) {
        super('drain preflight refused');
        this.status = status;
        this.payload = payload;
    }
}
/**
 * The probe finished with a normal no-op (`skipped: "current"`). The route's
 * existing answer is the correct result; there is no operation to defer.
 */
export class DrainNoop extends Error {
    status;
    payload;
    constructor(status, payload) {
        super('drain probe is a no-op');
        this.status = status;
        this.payload = payload;
    }
}
const MAX_RETAINED = 50;
const VIEW_LIMIT = 10;
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function text(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
/** User-facing failure text, stripped of control characters and home paths. */
function safeMessage(value) {
    const raw = text(value);
    if (raw === null)
        return null;
    return redactHomePaths(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1200);
}
function failureCode(status, payload) {
    if (payload?.targetChanged === true)
        return 'TARGET_CHANGED';
    if (payload?.agentsBusy === true)
        return 'AGENTS_RUNNING';
    const explicit = text(payload?.failureCode);
    if (explicit !== null)
        return explicit;
    if (payload?.busy === true || status === 409)
        return 'OPERATION_BUSY';
    return 'MUTATION_FAILED';
}
function outcomeOf(kind, name, payload) {
    const activations = record(payload?.activation);
    const activation = activations === null ? null : record(activations[name]);
    const activationState = activation === null ? null : text(activation.state);
    const hot = payload?.hot === true;
    return {
        needsRefresh: payload?.needsRefresh === true
            || (kind === 'install' && !hot)
            || (activationState === 'live' && hot),
        restartRequired: activationState === 'restart',
        activation: activationState,
        hot,
    };
}
export class DrainCoordinator {
    host;
    journal;
    bootId;
    now;
    maxRetained;
    log;
    abortMutation;
    operations = new Map();
    holds = new Map();
    subscriptions = [];
    activityWaiters = new Set();
    subscribed;
    sequence = 0;
    active = null;
    disposeRequested = false;
    barrierBroken = false;
    constructor(options) {
        this.host = options.host;
        this.journal = options.journal;
        this.bootId = options.bootId;
        this.now = options.now ?? Date.now;
        this.maxRetained = options.maxRetained ?? MAX_RETAINED;
        this.log = options.log ?? (() => { });
        this.abortMutation = options.abortMutation;
        // Subscribe before the first inventory snapshot (FR-4). A host without
        // both events cannot close the creation race, so drain stays unsupported.
        const created = this.host.onCreated(agent => this.onAgentCreated(agent));
        const disposed = this.host.onDisposed(agent => this.onAgentDisposed(agent));
        if (created !== null)
            this.subscriptions.push(created);
        if (disposed !== null)
            this.subscriptions.push(disposed);
        this.subscribed = created !== null && disposed !== null;
    }
    /** Whether one deferred or running operation owns the lane. */
    hasActive() {
        return this.active !== null && !this.active.settled;
    }
    /**
     * Whether the executor may still change files right now.
     *
     * Called under the mutation lock at the route entrance and again
     * immediately before every package command. The second call is the
     * load-bearing one: the validation between the two can take seconds on the
     * network, during which an Agent can become active, the user can cancel, or
     * the market can unload. It also re-enumerates live Agents and claims any
     * idle one that the creation subscription missed, so an undelivered
     * `agent/created` cannot let a turn start between the last wait and the file
     * change.
     */
    assertCanMutate() {
        if (this.disposeRequested)
            return { ok: false, reason: 'market-unloaded', ids: [] };
        const active = this.active;
        if (active === null || active.settled || active.cancelRequested) {
            return { ok: false, reason: 'cancelled', ids: [] };
        }
        if (this.barrierBroken)
            return { ok: false, reason: 'barrier-broken', ids: [] };
        const live = this.liveAgents();
        if (live === null)
            return { ok: false, reason: 'agents-service-unavailable', ids: [] };
        const unheld = [];
        for (const agent of live) {
            if (!this.holds.has(agent.id) && !this.claim(agent))
                unheld.push(agent.id);
        }
        if (unheld.length > 0)
            return { ok: false, reason: 'agent-active', ids: unheld };
        return { ok: true };
    }
    /**
     * Whether this request may use drain mode.
     *
     * Re-evaluated per request: a host that gains an incompatible Agent handle
     * after mount must not be treated as drain-capable just because the service
     * exists.
     */
    support() {
        if (this.disposeRequested)
            return { supported: false, reason: 'unloading', incompatibleIds: [] };
        if (!this.subscribed)
            return { supported: false, reason: 'no-agent-events', incompatibleIds: [] };
        let listed;
        try {
            listed = this.host.list();
        }
        catch {
            listed = null;
        }
        if (listed === null)
            return { supported: false, reason: 'no-agents-service', incompatibleIds: [] };
        const incompatibleIds = [];
        for (const entry of listed) {
            if (drainableAgent(entry) === null)
                incompatibleIds.push(agentId(entry) ?? 'agent');
        }
        if (incompatibleIds.length > 0)
            return { supported: false, reason: 'incompatible-agents', incompatibleIds };
        return { supported: true, reason: 'ok', incompatibleIds: [] };
    }
    /** The current process's exposed operations, active first, terminal newest last. */
    list(limit = VIEW_LIMIT) {
        const exposed = [...this.operations.values()].filter(operation => operation.exposed);
        const active = exposed.filter(operation => !operation.settled);
        const terminal = exposed.filter(operation => operation.settled);
        const room = Math.max(0, limit - active.length);
        return active.concat(room === 0 ? [] : terminal.slice(-room)).map(operation => this.view(operation));
    }
    get(operationId) {
        const operation = this.operations.get(operationId);
        return operation === undefined || !operation.exposed ? null : this.view(operation);
    }
    /**
     * Accept a drain request.
     *
     * With no Agent running this claims every idle Agent synchronously and runs
     * the ordinary executor inline, returning its normal response. Otherwise it
     * captures intent, returns a deferred record, and the drain loop waits.
     */
    async begin(request) {
        if (this.disposeRequested) {
            return { mode: 'refused', status: 503, payload: { ok: false, error: 'the market is unloading' } };
        }
        if (this.hasActive())
            return { mode: 'busy' };
        const support = this.support();
        if (!support.supported) {
            return { mode: 'unsupported', reason: support.reason, incompatibleIds: support.incompatibleIds };
        }
        const operation = this.createOperation(request);
        this.active = operation;
        this.barrierBroken = false;
        try {
            // Claim every idle Agent synchronously. A failure here means that Agent
            // is mid-turn or another maintenance task owns it, and the deferred loop
            // will wait for it instead of touching its files. An unreadable
            // inventory is not an empty one: refuse rather than mutate unheld.
            const live = this.liveAgents();
            if (live === null) {
                this.abandon(operation);
                return { mode: 'unsupported', reason: 'agents-service-unavailable', incompatibleIds: [] };
            }
            for (const agent of live)
                this.claim(agent);
            const afterClaims = this.liveAgents();
            if (afterClaims === null) {
                this.abandon(operation);
                return { mode: 'unsupported', reason: 'agents-service-unavailable', incompatibleIds: [] };
            }
            const unheld = afterClaims.filter(agent => !this.holds.has(agent.id));
            if (unheld.length === 0 && request.forceDeferred !== true) {
                return await this.runInline(operation);
            }
            // The probe may still be refused (`TARGET_CHANGED`, no-op, unsupported
            // host). Do not expose the operation until it is actually deferred:
            // publishing it now would leave the client with a Host row that the
            // Host then deletes, which the client has no event to clean up.
            operation.state = 'accepted';
            this.setWait(operation, unheld);
            const intent = await request.captureIntent();
            if (!operation.settled) {
                operation.intent = intent;
                operation.name = intent.name;
                if (intent.url !== undefined)
                    operation.url = intent.url;
            }
            if (operation.cancelRequested || operation.settled || this.disposeRequested) {
                if (!operation.settled) {
                    this.releaseAll();
                    this.finish(operation, 'cancelled', null, null);
                }
                return {
                    mode: 'terminal',
                    operation: this.view(operation),
                    status: 200,
                    payload: { ok: false, cancelled: true },
                };
            }
            operation.state = 'draining';
            const current = this.liveAgents();
            if (current === null) {
                this.releaseAll();
                this.finish(operation, 'failed', {
                    code: 'AGENT_DRAIN_UNSUPPORTED',
                    message: 'the host stopped offering a readable Agent inventory before the operation started',
                }, null);
                const view = this.view(operation);
                return {
                    mode: 'terminal',
                    operation: view,
                    status: 500,
                    payload: { ok: false, error: view.failure?.message ?? 'the host stopped offering a readable Agent inventory' },
                };
            }
            this.setWait(operation, current.filter(agent => !this.holds.has(agent.id)));
            this.notify(operation);
            void this.runDeferred(operation);
            return { mode: 'deferred', operation: this.view(operation) };
        }
        catch (error) {
            if (error instanceof DrainRefusal || error instanceof DrainNoop) {
                this.abandon(operation);
                return { mode: 'refused', status: error.status, payload: error.payload };
            }
            const message = safeMessage(error instanceof Error ? error.message : String(error))
                ?? 'the drain preflight failed';
            this.log('error', 'drain', `preflight failed before acceptance — ${message}`);
            this.abandon(operation);
            return { mode: 'refused', status: 500, payload: { ok: false, error: message } };
        }
    }
    /**
     * Cancel one exposed operation. Before the executor starts this performs no
     * mutation; after it starts, the existing package-command cancellation path
     * runs and the holds are released once it settles.
     */
    cancel(operationId) {
        const operation = this.operations.get(operationId);
        if (operation === undefined || operation.settled)
            return false;
        operation.cancelRequested = true;
        this.notifyActivity();
        if (operation.state === 'running' || operation.state === 'verifying') {
            this.abortMutation?.();
            this.notify(operation);
            return true;
        }
        if (operation.state === 'accepted') {
            // The intent probe may still be in flight. Finish now and release the
            // holds it already took; `begin` sees `settled` when the probe returns
            // and only reports the terminal view. Waiting for the probe here would
            // leave every claimed Agent parked for as long as it takes.
            this.releaseAll();
            this.finish(operation, 'cancelled', null, null);
            return true;
        }
        this.finish(operation, 'cancelled', null, null);
        this.releaseAll();
        return true;
    }
    /** Resolve after one operation reaches a terminal state. Tests and the API bridge use it. */
    async whenSettled(operationId) {
        const operation = this.operations.get(operationId);
        if (operation === undefined)
            return null;
        if (operation.settled)
            return this.view(operation);
        return await new Promise(resolve => {
            const previous = operation.resolveSettled;
            operation.resolveSettled = view => {
                previous(view);
                resolve(view);
            };
        });
    }
    /**
     * Release every hold, cancel the active operation, and detach the host
     * subscriptions. Called from the market's mount disposer; the second half of
     * the "finally + disposer" guarantee that no Agent is left parked.
     */
    dispose() {
        if (this.disposeRequested)
            return;
        this.disposeRequested = true;
        const active = this.active;
        const executing = active !== null && !active.settled
            && (active.state === 'running' || active.state === 'verifying');
        const detach = () => {
            for (const dispose of this.subscriptions.splice(0)) {
                try {
                    dispose();
                }
                catch { /* host already tore the subscription down */ }
            }
            this.notifyActivity();
        };
        if (executing) {
            // The executor is already inside a package command. Stop that command,
            // stop any later runPlugin through the pre-command gate, and leave the
            // holds and the Agent subscription in place until the drain loop's
            // finally runs: releasing or detaching now would leave a live command
            // changing files with nobody watching the Agents.
            this.abortMutation?.();
            return;
        }
        if (active !== null && !active.settled) {
            this.finish(active, 'cancelled', {
                code: 'MARKET_UNLOADED',
                message: 'the market was unloaded before this operation finished',
            }, null);
        }
        this.releaseAll();
        detach();
    }
    /** Detach the host subscriptions once; safe to call more than once. */
    detach() {
        for (const dispose of this.subscriptions.splice(0)) {
            try {
                dispose();
            }
            catch { /* host already tore the subscription down */ }
        }
        this.notifyActivity();
    }
    // -------------------------------------------------------------- drain loop
    async runInline(operation) {
        operation.exposed = false;
        operation.state = 'running';
        operation.startedAt = this.now();
        let result;
        try {
            result = await operation.execute(null, operation.onPhase);
        }
        catch (error) {
            result = {
                status: 500,
                payload: {
                    ok: false,
                    error: safeMessage(error instanceof Error ? error.message : String(error)) ?? 'the drain executor failed',
                },
            };
        }
        finally {
            this.releaseAll();
            if (this.disposeRequested)
                this.detach();
        }
        if (this.disposeRequested) {
            result = {
                status: 503,
                payload: {
                    ok: false,
                    failureCode: 'MARKET_UNLOADED',
                    error: 'the market was unloaded before this operation finished',
                },
            };
            this.finish(operation, 'cancelled', {
                code: 'MARKET_UNLOADED',
                message: 'the market was unloaded before this operation finished',
            }, null);
        }
        else if (operation.cancelRequested) {
            result = { status: 200, payload: { ok: false, cancelled: true } };
            this.finish(operation, 'cancelled', null, null);
        }
        else if (this.barrierBroken) {
            result = {
                status: 500,
                payload: {
                    ok: false,
                    failureCode: 'AGENT_BARRIER_LOST',
                    error: 'an Agent could not be held at the maintenance boundary; verify the installed files before retrying',
                },
            };
            this.finish(operation, 'failed', {
                code: 'AGENT_BARRIER_LOST',
                message: 'an Agent could not be held at the maintenance boundary; verify the installed files before retrying',
            }, null);
        }
        else {
            this.finishFromResult(operation, result);
        }
        return { mode: 'inline', operation: this.view(operation), result };
    }
    async runDeferred(operation) {
        operation.exposed = true;
        try {
            for (;;) {
                if (operation.cancelRequested || this.disposeRequested) {
                    this.finish(operation, 'cancelled', null, null);
                    return;
                }
                if (this.barrierBroken) {
                    this.finish(operation, 'failed', {
                        code: 'AGENT_BARRIER_LOST',
                        message: 'an Agent could not be held at the maintenance boundary; the plugin operation was not started',
                    }, null);
                    return;
                }
                const held = await this.drainAgents(operation);
                if (!held) {
                    if (operation.cancelRequested || this.disposeRequested) {
                        this.finish(operation, 'cancelled', null, null);
                    }
                    else if (this.barrierBroken) {
                        this.finish(operation, 'failed', {
                            code: 'AGENT_BARRIER_LOST',
                            message: 'an Agent could not be held at the maintenance boundary; the plugin operation was not started',
                        }, null);
                    }
                    else {
                        this.finish(operation, 'failed', {
                            code: 'AGENT_DRAIN_UNSUPPORTED',
                            message: 'the host stopped offering a usable Agent maintenance boundary',
                        }, null);
                    }
                    return;
                }
                // Final synchronous re-enumeration. The creation subscription claims a
                // new Agent before its first turn; if one still slipped in, go back to
                // waiting instead of mutating under it. An unreadable inventory is a
                // failure, not an empty list.
                const live = this.liveAgents();
                if (live === null) {
                    this.finish(operation, 'failed', {
                        code: 'AGENT_DRAIN_UNSUPPORTED',
                        message: 'the host stopped offering a readable Agent inventory before the operation started',
                    }, null);
                    return;
                }
                let allHeld = true;
                for (const agent of live) {
                    if (!this.holds.has(agent.id) && !this.claim(agent))
                        allHeld = false;
                }
                if (this.barrierBroken)
                    continue;
                const afterClaims = this.liveAgents();
                if (afterClaims === null) {
                    this.finish(operation, 'failed', {
                        code: 'AGENT_DRAIN_UNSUPPORTED',
                        message: 'the host stopped offering a readable Agent inventory before the operation started',
                    }, null);
                    return;
                }
                if (!allHeld || afterClaims.some(agent => !this.holds.has(agent.id)))
                    continue;
                break;
            }
            operation.state = 'queued-for-mutation';
            this.notify(operation);
            if (operation.cancelRequested) {
                this.finish(operation, 'cancelled', null, null);
                return;
            }
            operation.state = 'running';
            operation.startedAt = this.now();
            this.notify(operation);
            const result = await operation.execute(operation.intent, operation.onPhase);
            // The executor can return success after a cancel or unload landed too
            // late for its last gate. The Host's state wins: the user asked to stop
            // or the market is gone, so this is not reported as a completed change.
            if (this.disposeRequested) {
                this.finish(operation, 'cancelled', {
                    code: 'MARKET_UNLOADED',
                    message: 'the market was unloaded before this operation finished',
                }, null);
                return;
            }
            if (operation.cancelRequested) {
                this.finish(operation, 'cancelled', null, null);
                return;
            }
            if (this.barrierBroken) {
                this.finish(operation, 'failed', {
                    code: 'AGENT_BARRIER_LOST',
                    message: 'an Agent started work while the package operation was running; verify the installed files before retrying',
                }, null);
                return;
            }
            this.finishFromResult(operation, result);
        }
        catch (error) {
            if (!operation.settled) {
                this.finish(operation, 'failed', {
                    code: 'DRAIN_FAILED',
                    message: safeMessage(error instanceof Error ? error.message : String(error))
                        ?? 'the drain coordinator failed',
                }, null);
            }
        }
        finally {
            this.releaseAll();
            if (!operation.settled) {
                if (this.disposeRequested) {
                    this.finish(operation, 'cancelled', {
                        code: 'MARKET_UNLOADED',
                        message: 'the market was unloaded before this operation finished',
                    }, null);
                }
                else {
                    this.finish(operation, 'failed', { code: 'DRAIN_FAILED', message: 'the drain coordinator stopped unexpectedly' }, null);
                }
            }
            if (this.disposeRequested)
                this.detach();
        }
    }
    /**
     * Wait until every live Agent is maintenance-held.
     * @returns true when the barrier is complete, false on cancel/dispose/loss.
     */
    async drainAgents(operation) {
        operation.state = 'draining';
        while (!operation.cancelRequested && !this.disposeRequested && !this.barrierBroken) {
            const live = this.liveAgents();
            if (live === null)
                return false;
            const unheld = live.filter(agent => !this.holds.has(agent.id));
            this.setWait(operation, unheld);
            if (unheld.length === 0)
                return true;
            let claimed = 0;
            for (const agent of unheld) {
                if (operation.cancelRequested || this.disposeRequested)
                    break;
                if (this.claim(agent))
                    claimed += 1;
            }
            const current = this.liveAgents();
            if (current === null)
                return false;
            const remaining = current.filter(agent => !this.holds.has(agent.id));
            this.setWait(operation, remaining);
            if (remaining.length === 0)
                return true;
            const waitingForTurn = remaining.some(agent => agent.status === 'running');
            const activity = this.waitForActivity();
            try {
                await Promise.race([
                    Promise.all(remaining.map(agent => agent.whenIdle().catch(() => undefined))),
                    activity.promise,
                ]);
            }
            finally {
                activity.dispose();
            }
            // A claim can fail without the Agent being busy (another maintenance
            // task owns it). `whenIdle` then stays pending, so this yield only
            // matters for a host that reports idle while refusing the claim. A
            // turn that just ended retries immediately.
            if (claimed === 0 && !waitingForTurn)
                await new Promise(resolve => setTimeout(resolve, 25));
        }
        return false;
    }
    // -------------------------------------------------------------- hold logic
    claim(agent) {
        if (this.holds.has(agent.id))
            return true;
        let releaseHeld;
        const held = new Promise(resolve => { releaseHeld = resolve; });
        const hold = {
            id: agent.id,
            settled: false,
            release: () => {
                if (hold.settled)
                    return;
                hold.settled = true;
                releaseHeld();
            },
        };
        // Record the hold BEFORE calling into the host: `runMaintenance` may
        // invoke the task synchronously, and an already-aborted signal settles
        // the hold before this function regains control. Setting it afterwards
        // would leave a settled entry that later claims mistake for a real hold.
        this.holds.set(agent.id, hold);
        try {
            // `runMaintenance` claims synchronously. A synchronous throw means a turn
            // or another maintenance task already owns the Agent; the caller waits.
            const running = agent.runMaintenance(signal => {
                const onAbort = () => {
                    hold.release();
                    this.onHoldLost(hold);
                };
                if (signal.aborted)
                    onAbort();
                else
                    signal.addEventListener('abort', onAbort, { once: true });
                return held;
            });
            void running.catch(() => {
                hold.release();
                this.onHoldLost(hold);
            });
        }
        catch {
            if (this.holds.get(agent.id) === hold)
                this.holds.delete(agent.id);
            return false;
        }
        if (hold.settled) {
            if (this.holds.get(agent.id) === hold)
                this.holds.delete(agent.id);
            return false;
        }
        return true;
    }
    onHoldLost(hold) {
        if (this.holds.get(hold.id) === hold)
            this.holds.delete(hold.id);
        const active = this.active;
        if (active === null || active.settled) {
            this.notifyActivity();
            return;
        }
        if (active.state === 'running' || active.state === 'verifying') {
            // The package command is already replacing files. Stop it rather than
            // leaving a turn running against them; the operation reports failure.
            this.barrierBroken = true;
            this.abortMutation?.();
            this.log('error', 'drain', 'maintenance hold was lost during the package operation; aborting it');
        }
        this.notifyActivity();
    }
    releaseAll() {
        for (const hold of this.holds.values())
            hold.release();
        this.holds.clear();
    }
    onAgentCreated(agent) {
        const drainable = drainableAgent(agent);
        if (drainable === null) {
            // An incompatible handle only matters while an operation owns the
            // barrier. Outside an operation it must not latch drain off for the rest
            // of the process: support() is re-evaluated per request.
            const active = this.active;
            if (active !== null && !active.settled) {
                this.barrierBroken = true;
                if (active.state === 'running' || active.state === 'verifying')
                    this.abortMutation?.();
            }
            this.notifyActivity();
            return;
        }
        const active = this.active;
        if (active !== null && !active.settled) {
            const claimed = this.claim(drainable);
            if (!claimed && (active.state === 'running' || active.state === 'verifying')) {
                this.barrierBroken = true;
                this.abortMutation?.();
            }
        }
        this.notifyActivity();
    }
    onAgentDisposed(agent) {
        const id = agentId(agent);
        if (id !== null) {
            const hold = this.holds.get(id);
            if (hold !== undefined) {
                this.holds.delete(id);
                hold.release();
            }
        }
        this.notifyActivity();
    }
    // ------------------------------------------------------------- operations
    createOperation(request) {
        const operationId = `${this.bootId}-drain-${String(++this.sequence)}`;
        const createdAt = this.now();
        let resolveSettled = () => { };
        const operation = {
            id: operationId,
            kind: request.kind,
            name: request.name,
            ...(request.url === undefined ? {} : { url: request.url }),
            state: 'accepted',
            createdAt,
            startedAt: null,
            finishedAt: null,
            waitSince: createdAt,
            wait: null,
            failure: null,
            outcome: null,
            intent: null,
            initialAgents: this.liveAgents()?.length ?? 0,
            exposed: request.forceDeferred === true,
            cancelRequested: false,
            settled: false,
            resolveSettled,
            execute: request.execute,
            onPhase: phase => {
                if (operation.settled || operation.state !== 'running')
                    return;
                operation.state = phase === 'verifying' ? 'verifying' : operation.state;
                this.notify(operation);
            },
            onUpdate: request.onUpdate,
        };
        this.operations.set(operationId, operation);
        // The new operation is the one that must survive eviction. Mark it active
        // before trimming so the oldest terminal record is the one dropped.
        this.active = operation;
        while (this.operations.size > this.maxRetained) {
            const oldest = [...this.operations.values()].find(candidate => candidate !== this.active && candidate.settled)
                ?? [...this.operations.values()].find(candidate => candidate !== this.active);
            if (oldest === undefined)
                break;
            this.operations.delete(oldest.id);
        }
        return operation;
    }
    abandon(operation) {
        this.releaseAll();
        if (this.active === operation)
            this.active = null;
        this.operations.delete(operation.id);
        operation.settled = true;
        operation.resolveSettled(null);
    }
    finishFromResult(operation, result) {
        const payload = record(result.payload);
        const cancelled = payload?.cancelled === true;
        const ok = result.status >= 200 && result.status < 300 && payload?.ok !== false && !cancelled;
        const state = cancelled ? 'cancelled' : ok ? 'succeeded' : 'failed';
        const failure = ok || cancelled
            ? null
            : {
                code: failureCode(result.status, payload),
                message: safeMessage(payload?.error) ?? `mutation failed with HTTP ${String(result.status)}`,
            };
        this.finish(operation, state, failure, ok ? outcomeOf(operation.kind, operation.name, payload) : null);
    }
    finish(operation, state, failure, outcome) {
        if (operation.settled)
            return;
        operation.settled = true;
        operation.state = state;
        operation.finishedAt = this.now();
        operation.wait = null;
        operation.failure = failure;
        operation.outcome = outcome;
        if (this.active === operation)
            this.active = null;
        if (operation.exposed) {
            try {
                this.journal.append({
                    at: operation.finishedAt,
                    id: operation.id,
                    kind: operation.kind,
                    name: operation.name,
                    state,
                    agentsAtStart: operation.initialAgents,
                    agentsAtEnd: this.liveAgents()?.length ?? 0,
                });
            }
            catch (error) {
                this.log('warn', 'drain', `terminal record could not be persisted — ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        this.log(state === 'succeeded' ? 'info' : state === 'cancelled' ? 'info' : 'warn', 'drain', `${operation.kind} ${operation.name}: ${state}${failure === null ? '' : ` (${failure.code})`}`);
        this.notify(operation);
        operation.resolveSettled(this.view(operation));
    }
    view(operation) {
        return {
            operationId: operation.id,
            kind: operation.kind,
            name: operation.name,
            ...(operation.url === undefined ? {} : { url: operation.url }),
            state: operation.state,
            createdAt: operation.createdAt,
            startedAt: operation.startedAt,
            finishedAt: operation.finishedAt,
            wait: operation.wait === null ? null : { ...operation.wait, activeAgentIds: [...operation.wait.activeAgentIds] },
            failure: operation.failure === null ? null : { ...operation.failure },
            outcome: operation.outcome === null ? null : { ...operation.outcome },
        };
    }
    notify(operation) {
        if (!operation.exposed || operation.onUpdate === undefined)
            return;
        try {
            operation.onUpdate(this.view(operation));
        }
        catch {
            // A projection failure must never take the coordinator down.
        }
    }
    setWait(operation, unheld) {
        const ids = unheld.map(agent => agent.id).sort();
        const previous = operation.wait;
        if (previous !== null
            && previous.activeCount === ids.length
            && previous.activeAgentIds.join('\u0000') === ids.join('\u0000'))
            return;
        operation.wait = ids.length === 0
            ? null
            : { reason: 'agents', activeCount: ids.length, activeAgentIds: ids, since: operation.waitSince };
        this.notify(operation);
    }
    /**
     * The live Agent handles, or null when the host's inventory is unreadable.
     *
     * Null is not an empty list: treating a half-disposed registry as "no
     * Agents" would let a drain request mutate files without holding anything.
     */
    liveAgents() {
        let listed;
        try {
            listed = this.host.list();
        }
        catch {
            return null;
        }
        if (listed === null)
            return null;
        const agents = [];
        for (const entry of listed) {
            const agent = drainableAgent(entry);
            if (agent !== null && !agents.some(candidate => candidate.id === agent.id))
                agents.push(agent);
        }
        return agents;
    }
    waitForActivity() {
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        const entry = () => resolve();
        this.activityWaiters.add(entry);
        return {
            promise,
            dispose: () => { this.activityWaiters.delete(entry); },
        };
    }
    notifyActivity() {
        const waiters = [...this.activityWaiters];
        this.activityWaiters.clear();
        for (const resolve of waiters)
            resolve();
    }
}
function agentId(agent) {
    if (agent === null || typeof agent !== 'object')
        return null;
    const id = agent.id;
    return typeof id === 'string' && id !== '' ? id : null;
}
