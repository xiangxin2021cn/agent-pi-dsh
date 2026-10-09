/**
 * Post-install activation verification (P0-2): what "installed" actually
 * means for a package in a dsh profile.
 *
 * Two sources of truth, in strict order of authority:
 *
 * 1. The LOADER INVENTORY (observed): whatever the loader is running right
 *    now is live, full stop. A plain library with no `dsh` field can be
 *    loaded by name from someone else's bundle patch — the official
 *    dsh-base patch loads `@deepseek-ai/dsh-tools`, which has no `dsh`
 *    field at all — so no manifest check may overrule it (#135).
 * 2. The profile manifest (inferred): `<profile>/package.json` →
 *    `dsh.profile.bundles`, what the dsh CLI reconciled. This predicts what
 *    the NEXT boot will load, and is the only evidence available for a
 *    package that is not currently running.
 *
 * State taxonomy (IMPROVEMENT-PLAN P0-2):
 *   live    – running in the current composition (hot mount or loader entry)
 *   restart – installed and will activate on the next boot, but not live now
 *   incompatible – the host's own boot gate will skip it on EVERY boot: its
 *             dsh peer range excludes the running runtime (#757). Restarting
 *             can never activate it — "restart to apply" would be a lie.
 *   inert   – installed but not a profile-layer plugin (plain dependency, or
 *             client-only — the market shim-mounts those at boot)
 *   broken  – would fail to load: listed as a bundle without a dsh surface,
 *             or a declared entry artifact that is missing
 *   missing – not present in node_modules
 */
export type ActivationState = 'live' | 'restart' | 'incompatible' | 'inert' | 'broken' | 'missing' | 'disabled';
export interface ActivationResult {
    state: ActivationState;
    /** Bilingual, user-facing explanations (zh / en joined with " / "). */
    reasons: string[];
    /** True when the package is in the profile's `dsh.profile.bundles`. */
    bundle: boolean;
    /** True when the package is live in the running composition. */
    hot: boolean;
    /**
     * The installed package that declares this one, when this package is a
     * plain library somebody else pulled in rather than a plugin the user
     * chose (#634). Only ever set on `inert`.
     */
    dependencyOf?: string;
}
/**
 * What the running host is, for the #757 boot-gate prediction.
 *
 * The host loader (evaluatePluginCompatibility in @deepseek-ai/dsh-app-boot)
 * semver-checks every bundle's `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*`
 * peerDependencies against the runtime version and silently SKIPS the
 * bundles that fail — on every boot. From the market's side the bundle
 * layer still declares the plugin while the loader inventory never shows
 * it, so it reads exactly like "will activate on restart"… forever. A
 * profile may carry a compatibility.json whose `pkg@version` keys list
 * host versions allowed to load anyway (the host's
 * readProfileVersionExemptions); the market mirrors both halves.
 */
export interface HostRuntimeFacts {
    /** @deepseek-ai/dsh-app-boot version the host runs; null = unknown. */
    runtimeVersion: string | null;
    /** `pkg@version` → host versions allowed to load despite the range. */
    exemptions: Record<string, readonly string[]>;
}
/** One dsh peer requirement the running host provably fails. */
export interface PeerGate {
    peer: string;
    range: string;
    runtimeVersion: string;
    /** True when the runtime sits BELOW the range's floor — upgrading the host can satisfy it (#758). */
    hostTooOld: boolean;
}
/**
 * Predict the host's boot gate for one installed package. Returns the first
 * dsh peer the running runtime fails, or null when the next boot would load
 * it — or when we cannot tell (unknown runtime, unparseable range), because
 * uncertainty must keep the old verdict, not invent a harsher one (#757).
 *
 * satisfiesRange runs with includePrerelease — the host's own semantics,
 * since every published host line is itself a prerelease — and an EMPTY
 * range counts as failing, mirroring the host: absence of a requirement is
 * not permission.
 *
 * Known differences from the host's verdict, kept deliberate (#758): the
 * runtime version comes from the @deepseek-ai/dsh-app-boot package.json
 * this tree can locate, not the host's self-reported getDshRuntimeVersion;
 * when no host is locatable the gate stands aside and the real boot still
 * applies its own. Exemptions mirror readProfileVersionExemptions from the
 * profile's compatibility.json. The FIRST failing dsh peer decides, as the
 * host's skip does — only the reported culprit may differ when several
 * peers fail at once.
 */
export declare function hostPeerGate(activeProfileDir: string, name: string, facts: HostRuntimeFacts): PeerGate | null;
/** The way out of a peer gate, in the direction the versions allow (#758). */
export declare function peerGateRemedy(gate: PeerGate): {
    zh: string;
    en: string;
};
/**
 * The production HostRuntimeFacts: the discovered runtime version plus the
 * profile's own exemption list. Re-read per call so an edited
 * compatibility.json takes effect without a market restart.
 */
export declare function defaultHostRuntimeFacts(activeProfileDir: string): HostRuntimeFacts;
export declare function verifyActivation(profile: string, name: string, live?: ReadonlySet<string>, explicitDir?: string, isDisabled?: boolean, hostFacts?: HostRuntimeFacts): ActivationResult;
/**
 * Correct a post-UPDATE verdict for a plugin that was already running.
 *
 * `verifyActivation` answers "is this name in the live loader inventory".
 * That is the right question after an install and the wrong one after an
 * update: the plugin was already live, so the answer stays "live" while the
 * process keeps serving the module it imported at boot. Replacing files under
 * a running composition does not re-import anything.
 *
 * Measured on a real host rather than reasoned about — updating the market
 * from 1.11.3 to 1.12.2 left `/dsh-market/status` reporting 1.11.3 with an
 * unchanged boot id, while the update route called it hot-loaded in the same
 * response. The browser half genuinely does refresh (the host re-serves the
 * client bundle from disk), which is what makes the wrong verdict credible:
 * the UI visibly becomes the new version while the server half does not.
 *
 * Only a plugin that was ALREADY live is affected. One that was missing,
 * broken or disabled beforehand has nothing loaded to shadow the new build,
 * so its fresh mount really does run the new code.
 *
 * Client-only packages are excluded for the same reason from the other end:
 * they have no host half to go stale, and the browser fetches their bundle
 * from disk on the next page load. Telling their users to restart would be
 * #156 again, in a narrower place — see `hasHostHalf`.
 * @param result the verdict computed from the loader inventory
 * @param hostHalfWasLive whether a HOST half was live BEFORE the replacement
 */
export declare function activationAfterReplace(result: ActivationResult, hostHalfWasLive: boolean): ActivationResult;
/**
 * Whether a package has a host (Node) half at all.
 *
 * A `dsh.client`-only package — themes, skins, most pure-UI plugins — runs
 * no server code: the market shim-mounts it so the loader has a live row,
 * and the browser re-fetches its bundle from disk on the next page load. An
 * update to one takes effect on refresh, with no restart to ask for.
 */
export declare function hasHostHalf(profile: string, name: string, explicitDir?: string): boolean;
/**
 * The client bundle path a package's `exports["./client"]` names, relative
 * to the package root — or `null` when it cannot be resolved CONFIDENTLY.
 *
 * Returning null is the important half. This feeds a post-install check
 * whose only job is to catch a corrupt bundle, and a resolver that guessed
 * wrong would report a healthy plugin as broken — worse than the silence it
 * replaces. So every shape this does not fully understand resolves to null
 * and the check simply does not run: unresolvable is not evidence of damage.
 *
 * Handles the two shapes real plugins ship: a plain string, and a
 * conditional object. For the object, only `browser` and `default` are
 * consulted — those are the conditions the host's client loader actually
 * activates; `import`/`require` describe a Node resolution this file is not
 * modelling, and picking one of those could name a different artifact.
 * Nested conditions recurse; anything else (arrays, non-relative targets)
 * gives up.
 */
export declare function clientBundlePath(exportsField: unknown, depth?: number): string | null;
/** What a bundle check concluded. `ok` covers "fine" AND "could not tell". */
export interface BundleCheck {
    ok: boolean;
    /** Populated only when the file was found AND failed to parse. */
    reason: string | null;
}
/**
 * Every installed plugin whose client bundle will not parse (#222 by
 * @MicroMilo).
 *
 * The per-package check above only ever looked at what an operation added,
 * which misses the failure that was actually reported: pnpm re-extracts the
 * WHOLE tree on any install, so updating one plugin can restore another
 * plugin's pristine — and broken — bundle, or fail to re-apply a patch that
 * was holding it together. The damage then surfaces at the next boot as
 * "failed to load plugins", with nothing connecting it to the install that
 * caused it.
 *
 * Cheap enough to run on every operation: 0.40ms per plugin including the
 * read (measured on a 385KB bundle), so a 30-plugin profile costs ~12ms
 * against an install that takes seconds.
 *
 * Silent on ESM bundles, like the per-package check it calls — see there for
 * why. Widening the sweep is exactly what would have turned that one false
 * "corrupt" into one per ESM plugin in the profile.
 *
 * Callers compare a before-list with an after-list rather than reporting
 * this one directly — a profile can carry a broken bundle indefinitely, and
 * re-reporting a problem the user already had would put them in front of
 * something this operation did not cause and cannot undo.
 */
export declare function brokenClientBundles(profile: string, explicitDir?: string): {
    name: string;
    reason: string;
}[];
/** Bundles broken after an operation that were intact before it. */
export declare function newlyBrokenBundles(before: readonly {
    name: string;
    reason: string;
}[], after: readonly {
    name: string;
    reason: string;
}[]): {
    name: string;
    reason: string;
}[];
export declare function checkClientBundle(profile: string, name: string, explicitDir?: string): BundleCheck;
