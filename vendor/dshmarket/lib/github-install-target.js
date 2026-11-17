import { resolveHeadCommit } from "./accelerate.js";
import { readBodyWhileProgressing } from "./body-progress.js";
import { marketFetch } from "./net.js";
import { githubRoutesFor, rememberGithubRoute, throughProxy } from "./regions.js";
import { NPM_NAME_RE } from "./sources.js";
const ROOT_TARGET_RE = /^github:([A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+))(?:#([0-9a-f]{40}))?$/;
const FETCH_TIMEOUT_MS = 4000;
const MAX_MANIFEST_BYTES = 256 * 1024;
/**
 * A package-like catalog name can point to the workspace root by mistake
 * (#1208). Check a commit's manifest before handing that root to the host:
 * Desktop can unpack it before refusing a package with no bundle.
 *
 * The curated catalog also lists entire collections (#18) and uses display
 * names for ordinary Git plugins. Only a declared workspace with no DSH
 * surface and a different root name gives enough evidence to refuse the add.
 */
export async function mismatchedWorkspaceRoot(target, name, region) {
    const source = ROOT_TARGET_RE.exec(target);
    if (source === null || !NPM_NAME_RE.test(name) || source[2].toLowerCase() === name)
        return null;
    const repo = source[1];
    const commit = source[3] ?? await resolveHeadCommit(repo, region);
    if (commit === null)
        return null;
    const url = `https://raw.githubusercontent.com/${repo}/${commit}/package.json`;
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    for (const route of githubRoutesFor('raw', region)) {
        if (signal.aborted)
            break;
        try {
            const response = await marketFetch(throughProxy(route, url), { signal, redirect: 'manual' });
            if (!response.ok) {
                await response.body?.cancel();
                continue;
            }
            const bytes = await readBodyWhileProgressing(response, FETCH_TIMEOUT_MS, 'GitHub package manifest', MAX_MANIFEST_BYTES);
            const manifest = JSON.parse(new TextDecoder().decode(bytes));
            if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest))
                continue;
            rememberGithubRoute('raw', route);
            const paths = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;
            return manifest.dsh === undefined && typeof manifest.name === 'string' && NPM_NAME_RE.test(manifest.name)
                && manifest.name !== name && Array.isArray(paths) && paths.some(path => typeof path === 'string' && path.trim() !== '')
                ? manifest.name
                : null;
        }
        catch {
            // A missing or inaccessible manifest cannot establish what the root is.
        }
    }
    return null;
}
