export interface CatalogReleaseSource {
    repo: string;
    asset: string;
    manifest: string;
}
/** Only the catalog's own floating asset opts an existing archive into updates. */
export declare function catalogReleaseSourceOf(spec: string, entry: {
    url: string;
    npm?: unknown;
    tarball?: unknown;
}): CatalogReleaseSource | null;
export declare function publishedReleaseUpdate(source: CatalogReleaseSource, name: string): Promise<{
    version: string;
    target: string;
} | null>;
