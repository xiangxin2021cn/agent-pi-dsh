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
export type DrainKind = 'install' | 'update' | 'uninstall';
export type DrainState = 'accepted' | 'draining' | 'queued-for-mutation' | 'running' | 'verifying' | 'succeeded' | 'failed' | 'cancelled';
export type DrainTerminalState = 'succeeded' | 'failed' | 'cancelled';
/** Why the operation is queued. Only `agents` exists in v1. */
export interface DrainWait {
    reason: 'agents';
    /** Agents that are live and not yet maintenance-held. */
    activeCount: number;
    /** Their local session ids, the same ids the 409 response names. */
    activeAgentIds: string[];
    since: number;
}
/** The immutable facts a delayed operation may not silently change. */
export interface DrainExpectation {
    /** install/update: the exact pnpm target (version, commit, or tarball). */
    target?: string;
    /** update/uninstall: the installed spec the operation was approved against. */
    spec?: string;
    /** update/uninstall: the installed version baseline, when readable. */
    version?: string | null;
}
export interface DrainIntent {
    kind: DrainKind;
    /** Package name, or the catalog name for an install. */
    name: string;
    /** Catalog url, present for installs. */
    url?: string;
    expected: DrainExpectation;
}
export interface DrainFailure {
    code: string;
    message: string;
}
/** Bounded terminal facts the client needs to drive its existing banners. */
export interface DrainOutcome {
    needsRefresh: boolean;
    restartRequired: boolean;
    activation: string | null;
    hot: boolean;
}
/** The browser-facing projection of one operation. */
export interface DrainOperationView {
    operationId: string;
    kind: DrainKind;
    name: string;
    url?: string;
    state: DrainState;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    wait: DrainWait | null;
    failure: DrainFailure | null;
    outcome: DrainOutcome | null;
}
/** The result of re-running the route's ordinary executor. */
export interface DrainExecutionResult {
    status: number;
    payload: unknown;
}
/** Why the executor may not touch the profile right now. */
export type DrainMutationReason = 'market-unloaded' | 'cancelled' | 'barrier-broken' | 'agents-service-unavailable' | 'agent-active';
export type DrainMutationGate = {
    ok: true;
} | {
    ok: false;
    reason: DrainMutationReason;
    ids: string[];
};
export interface DrainJournalRecord {
    at: number;
    id: string;
    kind: DrainKind;
    name: string;
    state: DrainTerminalState;
    agentsAtStart: number;
    agentsAtEnd: number;
}
export interface DrainJournalLike {
    append(record: DrainJournalRecord): void;
}
/**
 * What the coordinator needs from the host.
 *
 * `list()` returns null when the host has no readable `agents` service.
 * The event methods return null when this host cannot report Agent creation
 * and disposal; without them the admission barrier is incomplete, so the
 * coordinator reports drain as unsupported rather than guessing.
 */
export interface DrainHost {
    list(): unknown[] | null;
    onCreated(listener: (agent: unknown) => void): (() => void) | null;
    onDisposed(listener: (agent: unknown) => void): (() => void) | null;
}
export interface DrainBeginRequest {
    kind: DrainKind;
    name: string;
    url?: string;
    /**
     * Capture the immutable intent. Called only when the operation actually has
     * to wait; the inline path executes immediately and needs no snapshot.
     */
    captureIntent: () => Promise<DrainIntent>;
    /** Run the same executor the immediate path uses. */
    execute: (intent: DrainIntent | null, onPhase: (phase: 'verifying') => void) => Promise<DrainExecutionResult>;
    /** Public API callers always project a queued 202, even with no Agent. */
    forceDeferred?: boolean;
    /** Called on every state/wait change for exposed operations. */
    onUpdate?: (view: DrainOperationView) => void;
}
export type DrainBeginResult = {
    mode: 'inline';
    operation: DrainOperationView;
    result: DrainExecutionResult;
} | {
    mode: 'deferred';
    operation: DrainOperationView;
}
/** The operation ended before it could be deferred (cancel, lost inventory). */
 | {
    mode: 'terminal';
    operation: DrainOperationView;
    status: number;
    payload: unknown;
} | {
    mode: 'refused';
    status: number;
    payload: unknown;
} | {
    mode: 'busy';
} | {
    mode: 'unsupported';
    reason: string;
    incompatibleIds: string[];
};
/** A probe (or an ordinary route replay) refused the request before mutation. */
export declare class DrainRefusal extends Error {
    readonly status: number;
    readonly payload: unknown;
    constructor(status: number, payload: unknown);
}
/**
 * The probe finished with a normal no-op (`skipped: "current"`). The route's
 * existing answer is the correct result; there is no operation to defer.
 */
export declare class DrainNoop extends Error {
    readonly status: number;
    readonly payload: unknown;
    constructor(status: number, payload: unknown);
}
export interface DrainCoordinatorOptions {
    host: DrainHost;
    journal: DrainJournalLike;
    bootId: string;
    now?: () => number;
    maxRetained?: number;
    log?: (level: 'info' | 'warn' | 'error', event: string, detail: string) => void;
    /** Stop the package command when a hold is lost mid-mutation. */
    abortMutation?: () => boolean;
}
export declare class DrainCoordinator {
    private readonly host;
    private readonly journal;
    private readonly bootId;
    private readonly now;
    private readonly maxRetained;
    private readonly log;
    private readonly abortMutation;
    private readonly operations;
    private readonly holds;
    private readonly subscriptions;
    private readonly activityWaiters;
    private readonly subscribed;
    private sequence;
    private active;
    private disposeRequested;
    private barrierBroken;
    constructor(options: DrainCoordinatorOptions);
    /** Whether one deferred or running operation owns the lane. */
    hasActive(): boolean;
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
    assertCanMutate(): DrainMutationGate;
    /**
     * Whether this request may use drain mode.
     *
     * Re-evaluated per request: a host that gains an incompatible Agent handle
     * after mount must not be treated as drain-capable just because the service
     * exists.
     */
    support(): {
        supported: boolean;
        reason: string;
        incompatibleIds: string[];
    };
    /** The current process's exposed operations, active first, terminal newest last. */
    list(limit?: number): DrainOperationView[];
    get(operationId: string): DrainOperationView | null;
    /**
     * Accept a drain request.
     *
     * With no Agent running this claims every idle Agent synchronously and runs
     * the ordinary executor inline, returning its normal response. Otherwise it
     * captures intent, returns a deferred record, and the drain loop waits.
     */
    begin(request: DrainBeginRequest): Promise<DrainBeginResult>;
    /**
     * Cancel one exposed operation. Before the executor starts this performs no
     * mutation; after it starts, the existing package-command cancellation path
     * runs and the holds are released once it settles.
     */
    cancel(operationId: string): boolean;
    /** Resolve after one operation reaches a terminal state. Tests and the API bridge use it. */
    whenSettled(operationId: string): Promise<DrainOperationView | null>;
    /**
     * Release every hold, cancel the active operation, and detach the host
     * subscriptions. Called from the market's mount disposer; the second half of
     * the "finally + disposer" guarantee that no Agent is left parked.
     */
    dispose(): void;
    /** Detach the host subscriptions once; safe to call more than once. */
    private detach;
    private runInline;
    private runDeferred;
    /**
     * Wait until every live Agent is maintenance-held.
     * @returns true when the barrier is complete, false on cancel/dispose/loss.
     */
    private drainAgents;
    private claim;
    private onHoldLost;
    private releaseAll;
    private onAgentCreated;
    private onAgentDisposed;
    private createOperation;
    private abandon;
    private finishFromResult;
    private finish;
    private view;
    private notify;
    private setWait;
    /**
     * The live Agent handles, or null when the host's inventory is unreadable.
     *
     * Null is not an empty list: treating a half-disposed registry as "no
     * Agents" would let a drain request mutate files without holding anything.
     */
    private liveAgents;
    private waitForActivity;
    private notifyActivity;
}
