/** Issue #991: pure, fail-closed selector for official Desktop npm stable updates. */
export interface NpmPackument {
    versions?: Record<string, unknown>;
    time?: Record<string, unknown>;
    'dist-tags'?: Record<string, unknown>;
}
export interface MatureUpdatePolicy {
    minimumReleaseAgeMs: number;
    exemptPackage?: boolean;
    exemptVersions?: ReadonlySet<string>;
    latestFromEndpoint?: string | null;
    /** Existing compatibility dialog may request a lower stable release. */
    maxVersion?: string;
}
export interface MatureUpdateSelection {
    candidate: string | null;
    latest: string | null;
    held: string | null;
    reason: 'eligible' | 'current' | 'held' | 'unknown-age' | 'inconsistent' | 'invalid-installed' | 'policy-unknown';
    nextMaturityAt: number | null;
    latestMaturityAt: number | null;
}
/** Accept stable SemVer, including build metadata, at both API boundaries. */
export declare function isStableReleaseVersion(value: unknown): value is string;
export declare function strictPublishTime(value: unknown): number | null;
export declare function selectMatureUpdate(packument: NpmPackument, installed: string | null, now: number, policy: MatureUpdatePolicy): MatureUpdateSelection;
/**
 * Judge ONE requested version against the same wait policy selectMatureUpdate
 * enforces, without selecting anything. The compatibility dialog names a
 * precise version ("update to 1.7.11: it declares support for this DSH") that
 * the age gate may still hold; the caller needs that fact in prose, not a 409.
 * Fail-closed like its sibling: an exempt package does not make a fabricated
 * or missing timestamp installable, and an unknown policy is not a pass.
 */
export interface VersionMaturity {
    publishedAt: number | null;
    matureAt: number | null;
    exempt: boolean;
    mature: boolean;
    policyKnown: boolean;
}
export declare function versionMaturity(packument: NpmPackument, version: string, now: number, policy: MatureUpdatePolicy): VersionMaturity;
