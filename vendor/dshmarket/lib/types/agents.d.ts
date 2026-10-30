/**
 * Optional host-provided agent inventory: lets the market refuse plugin
 * mutations while a live agent is mid-turn. Mutating `node_modules` under a
 * running agent replaces files the running plugin modules may still read or
 * lazily import — the update "succeeds" while old code and new files mix.
 */
export interface RunningAgentLike {
    id?: unknown;
    status?: unknown;
}
export interface AgentsServiceLike {
    list(): RunningAgentLike[];
}
/**
 * The part of the host's public Agent contract drain mode needs.
 *
 * Both members are optional here on purpose: the market supports hosts that
 * predate them, and the coordinator must decide per request whether it can
 * take the safety barrier rather than assuming the service implies it.
 */
export interface AgentHandlesLike extends RunningAgentLike {
    whenIdle?: unknown;
    runMaintenance?: unknown;
}
/** A live Agent whose public maintenance boundary is usable. */
export interface DrainableAgent {
    id: string;
    status: unknown;
    whenIdle(): Promise<void>;
    runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>;
}
/** The id the market reports for an agent, or null when it has none. */
export declare function agentIdOf(agent: RunningAgentLike | null | undefined): string | null;
/**
 * Normalize one live Agent handle, or null when this host cannot put it under
 * a maintenance hold.
 *
 * The methods are read structurally and called through the handle so a host
 * implementation that relies on `this` keeps working. A missing `id` is also
 * incompatible: the coordinator tracks holds by id, and two anonymous agents
 * would collapse into one entry.
 */
export declare function drainableAgent(agent: unknown): DrainableAgent | null;
export type AgentsLookup = () => AgentsServiceLike | undefined;
/**
 * Ids of the host's currently running agents, or [] when the host has no
 * agents service. Only a positive `status === 'running'` blocks an update —
 * unknown statuses are treated as not running, so a future agent
 * implementation with different wording fails open (the market stays
 * usable) instead of wedging the plugin page.
 */
export declare function runningAgentIds(agents: AgentsServiceLike | undefined): string[];
