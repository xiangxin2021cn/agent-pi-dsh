/**
 * Discovery-time DSH compatibility metadata.
 *
 * The public catalog does not carry package manifests. Fetching every manifest
 * while the market opens would turn one catalog request into more than a
 * thousand registry requests, so this module supplies a bounded, on-demand
 * index. Successful public manifest facts are cached beside the market's
 * profile state; conclusions are never cached because they depend on the DSH
 * version of the process serving the page.
 */
import { createHash } from 'node:crypto';
import { compareSemver, isSemver, satisfiesRange } from "./check.js";
import { classifyPeer, crossesImplicitCeiling } from "./compatibility.js";
import { openDiscoveryCache } from "./discovery-cache.js";
import { marketFetch } from "./net.js";
import { isStableReleaseVersion } from "./release-candidates.js";
import { activeRegion, githubRoutesFor, rememberGithubRoute, throughProxy } from "./regions.js";
import { parseSourceUrl } from "./sources.js";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const OUTAGE_COOLDOWN_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 8;
const MAX_RANGE_LENGTH = 256;
/** Only the selected artifact and its declarations determine a discovery verdict. */
export function githubCompatibilityRevision(source) {
    const facts = catalogReleaseManifest(source);
    return createHash('sha256').update(JSON.stringify([
        source.url,
        source.tarball ?? null,
        range(source.version),
        facts === null ? null : [facts.version, facts.enginesDsh,
            Object.entries(facts.peerDependencies).sort(), Object.entries(facts.dependencies ?? {}).sort()],
    ])).digest('hex');
}
/** Reuse catalog facts only for this repository's exact pinned install asset. */
export function catalogReleaseManifest(source) {
    const facts = record(source.releaseManifest);
    const repository = parseSourceUrl(source.url)?.repo;
    const release = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/[^/]+\/[^/?#]+\.(?:tgz|tar\.gz)$/.exec(source.tarball ?? '');
    if (facts === null || !repository || !release || release[1].toLowerCase() !== repository.toLowerCase()
        || facts.tarball !== source.tarball || !validFacts(facts))
        return null;
    return {
        version: facts.version,
        enginesDsh: facts.enginesDsh,
        peerDependencies: facts.peerDependencies,
        dependencies: facts.dependencies ?? {},
    };
}
function npmDiscoveryKey(name, registry, version) {
    return version === undefined ? name : `npm:${registry}\u0000${name}\u0000${version}`;
}
function githubDiscoveryKey(source) {
    const key = `github:${source.url}\u0000${source.tarball ?? ''}`;
    const version = range(source.version);
    return version === null ? key : `${key}\u0000${version}`;
}
/** Read the linked package at its selected release, never the repository root by accident. */
async function githubManifest(source, fetcher) {
    const parsed = parseSourceUrl(source.url);
    if (parsed === null)
        throw new Error('not a GitHub package source');
    const json = async (url) => {
        const response = await fetcher(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { accept: 'application/json', 'user-agent': 'dsh-market' },
        });
        if (!response.ok)
            throw new Error(`HTTP ${String(response.status)}`);
        return await response.json();
    };
    let ref = /\/tree\/([^/]+)\//.exec(source.url)?.[1] ?? 'HEAD';
    if (source.tarball != null) {
        const release = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/(?:download\/([^/]+)|latest\/download)\/[^/?#]+\.(?:tgz|tar\.gz)$/.exec(source.tarball);
        if (release === null || release[1].toLowerCase() !== parsed.repo.toLowerCase()) {
            throw new Error('archive does not name this repository release');
        }
        if (release[2] !== undefined)
            ref = decodeURIComponent(release[2]);
        else {
            const latest = record(await json(`https://api.github.com/repos/${parsed.repo}/releases/latest`));
            if (typeof latest?.tag_name !== 'string')
                throw new Error('release tag unavailable');
            ref = latest.tag_name;
        }
    }
    if (ref === '' || ref.length > 256 || ref.split('/').some(part => part === '' || part === '.' || part === '..')) {
        throw new Error('invalid GitHub reference');
    }
    const file = parsed.subpath === null ? 'package.json' : `${parsed.subpath}/package.json`;
    const manifest = await rawJson(`https://raw.githubusercontent.com/${parsed.repo}/${encodeURIComponent(ref)}/${file}`);
    if (record(manifest) === null)
        throw new Error('package manifest unavailable');
    return manifest;
    /**
     * Read a raw file through the region's configured routes, in order.
     *
     * `raw.githubusercontent.com` is blockable on its own — the report (#1148)
     * measured an `ECONNRESET` with no proxy and a 200 through one — while the
     * catalog and the registry answered fine, so "the market page loads" said
     * nothing about this read. This path used to compose the host directly and
     * give up on the first error, and the card then said the host's requirement
     * was unknown even though the release declares one. The routes are the same
     * list the update path walks; one retry per route covers the transient
     * resets that made a single miss look permanent.
     */
    async function rawJson(url) {
        let last;
        for (const route of githubRoutesFor('raw', activeRegion())) {
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const value = await json(throughProxy(route, url));
                    rememberGithubRoute('raw', route);
                    return value;
                }
                catch (error) {
                    last = error;
                }
            }
        }
        throw last instanceof Error ? last : new Error('GitHub raw content unavailable');
    }
}
function range(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed !== '' && trimmed.length <= MAX_RANGE_LENGTH ? trimmed : null;
}
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
/** Keep only the small public subset of an npm manifest needed by discovery. */
export function manifestFacts(value) {
    const manifest = record(value) ?? {};
    const engines = record(manifest.engines);
    // #577: the ecosystem declares the host requirement in BOTH shapes —
    // top-level `engines.dsh` and `dsh.engines.dsh` under the manifest's own
    // `dsh` field (the natural home, and what e.g. @linxin666/dsh-web-all
    // publishes). Neither position is authoritative, so read both; when a
    // manifest carries both, the top-level declaration wins.
    const dshEngines = record(record(manifest.dsh)?.engines);
    const peers = record(manifest.peerDependencies);
    const peerDependencies = {};
    for (const [name, raw] of Object.entries(peers ?? {})) {
        if (!name.startsWith('@deepseek-ai/'))
            continue;
        const declared = range(raw);
        if (declared !== null)
            peerDependencies[name] = declared;
    }
    const dependencies = record(manifest.dependencies);
    const hostDependencies = {};
    for (const [name, raw] of Object.entries(dependencies ?? {})) {
        if (!name.startsWith('@deepseek-ai/'))
            continue;
        const declared = range(raw);
        if (declared !== null)
            hostDependencies[name] = declared;
    }
    return {
        version: range(manifest.version),
        enginesDsh: range(engines?.dsh) ?? range(dshEngines?.dsh),
        peerDependencies,
        dependencies: hostDependencies,
    };
}
function validFacts(value) {
    const facts = record(value);
    const peers = record(facts?.peerDependencies);
    // A missing `dependencies` is a pre-upgrade cache entry or catalog manifest,
    // not a malformed one: the durable cache must survive the upgrade rather than
    // be discarded and refetched a thousand packages at once.
    const dependencies = record(facts?.dependencies);
    return facts !== null
        && (facts.version === null || range(facts.version) === facts.version)
        && (facts.enginesDsh === null || range(facts.enginesDsh) === facts.enginesDsh)
        && peers !== null
        && Object.entries(peers).every(([name, item]) => name.startsWith('@deepseek-ai/') && range(item) === item)
        && (dependencies === null || Object.entries(dependencies).every(([name, item]) => name.startsWith('@deepseek-ai/') && range(item) === item));
}
function decodeCacheEntry(value) {
    const entry = record(value);
    if (entry === null || typeof entry.checkedAt !== 'number' || !Number.isFinite(entry.checkedAt) || !validFacts(entry.facts))
        return null;
    // Normalize the pre-upgrade shape so every consumer sees an object.
    const facts = entry.facts.dependencies === undefined ? { ...entry.facts, dependencies: {} } : entry.facts;
    return { checkedAt: entry.checkedAt, facts };
}
function displayRequirement(declarations) {
    const unique = [...new Set(declarations.map(item => item.range))];
    return unique.length === 0 ? null : unique.join(' ∩ ');
}
function rangeResult(hostVersion, declared) {
    return satisfiesRange(hostVersion, declared, { includePrerelease: true });
}
/**
 * Host peers imply the DSH release-line floor, but old ecosystem packages
 * often carry caret ranges such as `^0.0.1` whose computed 0.x upper bound
 * was never intended as a host ceiling. Reuse install preflight's directional
 * policy: below-min and explicit upper/exact violations are definite; a
 * newer host above an implicit caret/tilde ceiling remains compatible.
 *
 * One case is carved out of that leniency: a host that has crossed the
 * implicit ceiling outright rather than merely straddling the prerelease gate
 * is a release line the author has left behind, and dsh's own gate refuses the
 * release for exactly that reason (#756 shape). Reporting it compatible is how
 * one install produces two contradicting verdicts — the market's, then the
 * gate's "installation rejected". See {@link crossesImplicitCeiling}.
 */
function declarationResult(declaration, hostVersion) {
    const satisfied = rangeResult(hostVersion, declaration.range);
    // Only a PEER may be stretched: it is a statement of intent about the host
    // line, and the ecosystem is full of sloppy caret ceilings. An engine is a
    // plain bound, and a DEPENDENCY is an install instruction — pnpm resolves
    // the declared range and hoists the result, so a range that excludes the
    // running version means a second copy shadows the host's.
    if (declaration.kind !== 'peer' || satisfied !== false)
        return satisfied;
    if (crossesImplicitCeiling(hostVersion, declaration.range))
        return false;
    const verdict = classifyPeer('discovery', declaration.package ?? '@deepseek-ai/dsh', declaration.range, hostVersion, false);
    if (verdict.kind === 'risk')
        return false;
    if (verdict.kind === 'warning' && verdict.warning.reason === 'aboveMax')
        return true;
    return null;
}
/**
 * Derive the current host verdict from raw manifest facts.
 *
 * Every valid declaration is conjunctive: an explicit `engines.dsh` and all
 * host peers must agree. A malformed declaration keeps a passing result
 * unknown, but cannot erase a definite mismatch from another declaration.
 */
export function deriveHostCompatibility(facts, hostVersion, hostPackages) {
    if (facts === null) {
        return { status: 'unknown', basis: 'unavailable', requirement: null, declarations: [] };
    }
    const declarations = [];
    if (facts.enginesDsh !== null) {
        declarations.push({ kind: 'engine', range: facts.enginesDsh });
    }
    for (const [name, declared] of Object.entries(facts.peerDependencies)) {
        // Cordis (4.x) and schemastery (3.x) are host packages, but are not on
        // DSH's lockstep 0.x release line and therefore say nothing about the
        // DSH version. `hostPackages` is the local install inventory plus its
        // curated fallback, so future lockstep DSH packages are picked up too.
        if (!hostPackages.has(name) || !/^@deepseek-ai\/dsh(?:-|$)/.test(name))
            continue;
        declarations.push({ kind: 'peer', package: name, range: declared });
    }
    for (const [name, declared] of Object.entries(facts.dependencies ?? {})) {
        // The peer filter above restricts itself to DSH's lockstep line because a
        // peer range on cordis or schemastery says nothing about the DSH version.
        // A dependency is different: it names a package the host itself provides,
        // and pnpm will install the declared copy and hoist it over the host's.
        // That is the dsh-qqbot failure — @deepseek-ai/dsh-settings and
        // dsh-credentials as ordinary dependencies at `^0.1.0-rc.5` over a
        // 0.2.2-rc.1 runtime — which the peer-only check could not see.
        // Still only the lockstep line: the range is judged against the DSH
        // version, and cordis (4.x) / schemastery (3.x) are not on it — a plugin
        // that depends on `@deepseek-ai/cordis@^4` would otherwise read as
        // incompatible with every host.
        if (!hostPackages.has(name) || !/^@deepseek-ai\/dsh(?:-|$)/.test(name))
            continue;
        declarations.push({ kind: 'dependency', package: name, range: declared });
    }
    const requirement = displayRequirement(declarations);
    if (declarations.length === 0) {
        return { status: 'unknown', basis: 'undeclared', requirement: null, declarations: [] };
    }
    if (hostVersion === null) {
        return { status: 'unknown', basis: 'manifest', requirement, declarations };
    }
    const outcomes = declarations.map(item => declarationResult(item, hostVersion));
    const status = outcomes.some(item => item === false)
        ? 'incompatible'
        : outcomes.every(item => item === true)
            ? 'compatible'
            : 'unknown';
    return { status, basis: 'manifest', requirement, declarations };
}
/**
 * Durable, bounded lookup of npm releases and catalog GitHub manifests.
 *
 * Failed requests are intentionally memory-only and short-lived: a mirror
 * outage must not become a day-long false "undeclared" result on disk.
 */
export class DiscoveryManifestIndex {
    cache;
    failures = new Map();
    inflight = new Map();
    fetcher;
    now;
    ttlMs;
    concurrency;
    consecutiveFailures = 0;
    unavailableUntil = 0;
    disposed = false;
    activeFetches = 0;
    fetchWaiters = [];
    constructor(cacheFile, options = {}) {
        this.cache = openDiscoveryCache(cacheFile, decodeCacheEntry);
        this.fetcher = options.fetcher ?? marketFetch;
        this.now = options.now ?? Date.now;
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
        this.concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
    }
    /** Unmount this index, retaining any writes already queued for this profile. */
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        await this.cache.release();
    }
    /** One semaphore for the whole index, including overlapping HTTP batches. */
    async withFetchPermit(operation) {
        if (this.activeFetches >= this.concurrency) {
            await new Promise(resolve => this.fetchWaiters.push(resolve));
        }
        else
            this.activeFetches += 1;
        try {
            return await operation();
        }
        finally {
            const next = this.fetchWaiters.shift();
            if (next === undefined)
                this.activeFetches -= 1;
            else
                next();
        }
    }
    retryDelay(key, now = this.now()) {
        return Math.max(0, Math.max(this.failures.get(key) ?? 0, this.unavailableUntil) - now);
    }
    npmRetryAfterMs(name, registry, version) {
        return this.retryDelay(npmDiscoveryKey(name, registry, version));
    }
    githubRetryAfterMs(source) {
        return this.retryDelay(githubDiscoveryKey(source));
    }
    async fetchOne(cacheKey, record, readManifest, expectedVersion) {
        const cached = await this.cache.get(cacheKey);
        const now = this.now();
        if (cached !== undefined && now - cached.checkedAt < this.ttlMs
            && (expectedVersion === undefined || cached.facts.version === expectedVersion))
            return cached.facts;
        if (this.retryDelay(cacheKey, now) > 0)
            return null;
        // Advisory and recording lookups keep separate in-flight slots: an
        // advisory call must not be answered by — or hand its answer to — a
        // recording one, or `record` would stop meaning anything when the two
        // overlap on the same package.
        const key = record ? cacheKey : `${cacheKey}\u0000advisory`;
        const pending = this.inflight.get(key);
        if (pending !== undefined)
            return await pending;
        const request = (async () => {
            try {
                const facts = await this.withFetchPermit(readManifest);
                if (expectedVersion !== undefined && facts.version !== expectedVersion)
                    throw new Error('npm returned a different release');
                if (record && !this.disposed) {
                    this.cache.set(cacheKey, { checkedAt: this.now(), facts });
                    this.failures.delete(cacheKey);
                    this.consecutiveFailures = 0;
                }
                return facts;
            }
            catch {
                if (record) {
                    const failedAt = this.now();
                    this.failures.set(cacheKey, failedAt + FAILURE_COOLDOWN_MS);
                    this.consecutiveFailures += 1;
                    if (this.consecutiveFailures >= this.concurrency) {
                        this.unavailableUntil = failedAt + OUTAGE_COOLDOWN_MS;
                    }
                }
                return null;
            }
            finally {
                this.inflight.delete(key);
            }
        })();
        this.inflight.set(key, request);
        return await request;
    }
    async readNpmManifest(name, version, registry) {
        const response = await this.fetcher(`${registry}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { accept: 'application/json', 'user-agent': 'dsh-market' },
        });
        if (!response.ok)
            throw new Error(`HTTP ${String(response.status)}`);
        return await response.json();
    }
    /**
     * Facts for ONE named release, rather than for `latest`.
     *
     * The install and update routes can name the release they are about to
     * install — the compatibility dialog resolves one for this host (#581), and
     * the update route resolves the channel's target — and judging those
     * against `latest` is wrong in both directions: it refuses the compatible
     * older release the dialog just found for this host (because the newest
     * release declares a range this host misses), and it would equally pass a
     * pinned release that is itself incompatible.
     *
     * Deliberately outside the cache. An install can target any old release,
     * whereas a discovery query is for the version shown in the catalog. A
     * pre-flight verdict must not decide what the diagnostics panel sees next (#619).
     *
     * A release whose manifest cannot be read is `null`, like every other
     * unreadable manifest: absence of a claim is not a verdict.
     */
    async lookupVersion(name, version, registry) {
        try {
            return manifestFacts(await this.withFetchPermit(() => this.readNpmManifest(name, version, registry)));
        }
        catch {
            return null;
        }
    }
    /**
     * Look up a bounded batch while never exceeding the configured fan-out.
     *
     * `record: false` answers the caller from the cache or the network but
     * writes nothing back — not a success, not a failure, not the outage
     * counters. A pre-flight check uses this: it runs before an operation is
     * allowed to proceed, so whatever it learns must not decide what the
     * diagnostics panel sees next (#619).
     */
    async lookup(names, registry, options = {}) {
        const shouldRecord = options.record !== false;
        const unique = [...new Set(names)];
        const result = {};
        let next = 0;
        const worker = async () => {
            while (next < unique.length) {
                const name = unique[next++];
                const version = options.versions?.get(name);
                result[name] = await this.fetchOne(npmDiscoveryKey(name, registry, version), shouldRecord, async () => {
                    const manifest = await this.readNpmManifest(name, version ?? 'latest', registry);
                    const returnedName = record(manifest)?.name;
                    if (version !== undefined && returnedName !== undefined && returnedName !== name) {
                        throw new Error('npm returned a different package');
                    }
                    return manifestFacts(manifest);
                }, version);
            }
        };
        await Promise.all(Array.from({ length: Math.min(this.concurrency, unique.length) }, worker));
        return result;
    }
    /** Catalog-approved GitHub sources, cached by both package path and selected archive. */
    async lookupGitHub(sources) {
        const unique = [...new Map(sources.map(source => [source.url, source])).values()];
        const result = {};
        let next = 0;
        const worker = async () => {
            while (next < unique.length) {
                const source = unique[next++];
                result[source.url] = await this.fetchOne(githubDiscoveryKey(source), true, async () => manifestFacts(await githubManifest(source, this.fetcher)));
            }
        };
        await Promise.all(Array.from({ length: Math.min(this.concurrency, unique.length) }, worker));
        return result;
    }
}
/**
 * The newest release of `npmName` whose own declarations this host satisfies.
 *
 * The answer to "the newest version is too new for this host — what CAN I
 * install?" (#581), which the refusal dialog used to answer with nothing.
 *
 * Only a CONFIRMED `compatible` verdict from {@link deriveHostCompatibility}
 * passes. `unknown` — no declaration, or a host version nobody can read — is
 * skipped rather than offered: pinning a release as "compatible" on the
 * strength of a missing field would be the same guess this whole check exists
 * to avoid.
 *
 * Prereleases are included, and ordered properly (a release outranks its own
 * prereleases): in this ecosystem the host line is often a prerelease, and
 * plugins declare against it by name — skipping them would report "none
 * found" where the fix exists.
 *
 * `minimumVersionExclusive` restricts the search to releases NEWER than the
 * installed one, which is what an update needs: suggesting a downgrade is not
 * an update.
 *
 * `stableOnly` drops prereleases. The official Desktop refuses to move a
 * stable install onto a prerelease by itself (#991), so offering one there is
 * an enabled button that can only answer 409 (#1161).
 *
 * @returns the version, or null when the packument cannot be read or nothing
 *   in the history declares itself compatible.
 */
export async function findCompatibleVersion(npmName, hostVersion, hostPackages, registry, fetcher = marketFetch, minimumVersionExclusive = null, stableOnly = false) {
    let doc;
    try {
        const res = await fetcher(`${registry}/${encodeURIComponent(npmName)}`, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json', 'user-agent': 'dsh-market' } });
        if (!res.ok)
            return null;
        doc = await res.json();
    }
    catch {
        return null;
    }
    const versions = record(record(doc)?.versions);
    if (versions === null)
        return null;
    const candidates = Object.keys(versions)
        .filter(version => isSemver(version)
        && (!stableOnly || isStableReleaseVersion(version))
        && (minimumVersionExclusive === null || compareSemver(version, minimumVersionExclusive) > 0))
        .sort((left, right) => compareSemver(right, left));
    for (const version of candidates) {
        if (deriveHostCompatibility(manifestFacts(versions[version]), hostVersion, hostPackages).status === 'compatible') {
            return version;
        }
    }
    return null;
}
