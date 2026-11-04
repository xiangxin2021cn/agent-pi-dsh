import { type ProfileBackup } from './backup.ts';
/** The single file every dshmarket backup Gist carries. */
export declare const GIST_FILENAME = "dsh-profile-backup.json";
/** GitHub hard limit for one Gist file (1 MB); enforced before upload. */
export declare const GIST_MAX_BYTES: number;
/** Environment variable for a host-configured token (never read from disk). */
export declare const GIST_TOKEN_ENV = "DSH_GITHUB_TOKEN";
/** Machine-readable error codes the client maps to localized messages. */
export type GistErrorCode = 'auth' | 'notfound' | 'rate-limit' | 'invalid' | 'timeout' | 'network' | 'other';
/** Error with a code for the UI; the message stays human-readable. */
export declare class GistError extends Error {
    readonly code: GistErrorCode;
    constructor(message: string, code?: GistErrorCode);
}
/** Classify any thrown value into a stable GistErrorCode. */
export declare function gistErrorCode(error: unknown): GistErrorCode;
export interface GistRef {
    id: string;
    htmlUrl: string;
}
/** Where the token used for a request came from (shown in the UI). */
export type GistTokenSource = 'token' | 'env' | 'gh';
/**
 * Normalize a Gist id or a gist.github.com URL to a bare id.
 * Anything else (paths, embedded slashes, oversize input) is rejected.
 */
export declare function parseGistId(input: string): string;
/**
 * Resolve the token for one request, in order of preference:
 * 1. an explicitly supplied token (session memory only);
 * 2. the host-configured DSH_GITHUB_TOKEN environment variable;
 * 3. an already-logged-in GitHub CLI (`gh auth token`) — the token is used
 *    for this request only and never written to disk.
 */
export declare function resolveGistTokenSource(bodyToken: unknown): Promise<{
    token: string;
    source: GistTokenSource;
}>;
/** Resolve just the token (kept for callers that do not need the source). */
export declare function resolveGistToken(bodyToken: unknown): Promise<string>;
/** Test hook: drop the gh token cache between tests. */
export declare function resetGhTokenCache(): void;
/**
 * Run `gh auth token` in a child the parent does not wait on, and give up
 * after 8 s no matter what. The parent never waits on the child (unref), so even if gh.exe
 * wedges under WSL interop the host event loop stays free and the request
 * returns a definite answer. 8 s because a Windows gh.exe cold start through
 * WSL interop is routinely slower than a native binary.
 */
/**
 * Spawn options for `gh auth token`, kept in one place because the Windows
 * answer is not the obvious one (#1094).
 *
 * `detached: true` becomes DETACHED_PROCESS on Windows, which strips the
 * parent's console and gives the child a NEW visible one — `windowsHide`'s
 * CREATE_NO_WINDOW loses to it. With a console-less host (DSH Desktop, a
 * wscript/task-scheduler launch) every 验证 / 导出 / 导入 on the backup page
 * flashed a terminal window titled `gh.exe`. Measured on Windows 11, two
 * variants, three runs each: detached visible 3/3, non-detached 0/3.
 *
 * What detached was here for — the parent never waiting on the child — is
 * already the `unref()` and the 8 s watchdog below, so POSIX keeps it and
 * Windows drops it.
 */
export declare function ghAuthSpawnOptions(platform?: NodeJS.Platform): {
    stdio: ['ignore', 'pipe', 'ignore'];
    detached: boolean;
    windowsHide: boolean;
};
/** Create a new private Gist carrying one backup file. */
export declare function createGist(token: string, content: string, signal?: AbortSignal): Promise<GistRef>;
/** Overwrite the backup file inside an existing Gist (other files kept). */
export declare function updateGist(token: string, gistId: string, content: string, signal?: AbortSignal): Promise<GistRef>;
/** Download and strictly validate the backup file inside a Gist. */
export declare function readGist(token: string, gistId: string, signal?: AbortSignal): Promise<ProfileBackup>;
/** Confirm the token is usable (GET /user). */
export declare function verifyGistToken(token: string, signal?: AbortSignal): Promise<void>;
/** True when the serialized backup fits inside a Gist file. */
export declare function fitsGistLimit(content: string): boolean;
