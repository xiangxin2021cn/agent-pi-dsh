/**
 * dsh-market host entry: mounts the market's HTTP routes once the profile
 * composes the webServer and shell services.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type MarketConfig } from './routes.ts';
export declare const name = "dsh-market";
/** Optional cordis.yml configuration; profile defaults to `web`. */
export type Config = Partial<Pick<MarketConfig, 'profile' | 'allowRestart' | 'maxSnapshots' | 'buildEnv'>>;
/**
 * The launcher's `profileContext` in one line, for the exported log (#744).
 *
 * Only the facts that decide the branch: whether the service is there, and
 * whether its shape is one `launchedProfile` accepts. Never the directory
 * itself — the log already carries the profile path where it is needed.
 */
export declare function describeProfileContext(value: unknown): string;
/**
 * The deployment's declared authorities, read from the host (#729).
 *
 * DSH's own /api fence accepts loopback OR an authority the operator declared
 * (`dsh web --trusted-host <name>`, plus the LAN literals the CLI derives when
 * bound to 0.0.0.0). The market's routes are `exact` registrations on the bare
 * webServer, and exact matches win over that fence's prefix, so they never
 * pass through it — and a loopback-only rule of its own made every mutating
 * route 403 on any deployment reached by a name.
 *
 * The `connection` service is optional: a host without it leaves the fence
 * exactly as it was, which is the behaviour every release so far has had.
 * @returns a restore function for the effect that installed it.
 */
export declare function useTrustedHosts(ctx: Context): () => void;
/**
 * Feed host detection the install anchor the launcher published.
 *
 * The CLI is located by walking `process.argv[1]` up to its package, and the
 * official Desktop by Electron's resources directory. An embedded host — a
 * packaged app that boots the dsh core tree in-process — has neither, so
 * `dshHostInfo()` answered null there and every host-version surface read
 * "unknown": Discover's compatibility filter (#473), the pre-install refusal
 * (#404), and the exported log's `dsh host:` line (#426). The launcher does
 * publish where its runtime is (`profileContext.installAnchor`), so hand
 * that to detection. Read through a live source, not a mount-time copy:
 * launchers may provide `profileContext` after the market mounts (the same
 * timing problem the origins above handle), and a frozen value would answer
 * "unknown" for the whole session on exactly those hosts.
 *
 * Exported for the specs that cover this wiring.
 * @returns a restore function for the effect that installed it.
 */
export declare function useLauncherInstallAnchor(ctx: Context): () => void;
export declare function apply(ctx: Context, config?: Config): void;
