import type { NpmManifestFacts } from './discovery-compatibility.ts';
export interface CacheEntry {
    checkedAt: number;
    facts: NpmManifestFacts;
}
type DecodeEntry = (raw: unknown) => CacheEntry | null;
/**
 * A single writer and shared view per cache path. The old JSON remains readable
 * until a complete journal has been published. Later writes append only the
 * changed rows, with occasional atomic snapshots to bound the log.
 */
declare class DiscoveryCache {
    private readonly file;
    private readonly decode;
    private readonly journal;
    private readonly entries;
    private readonly pending;
    private loaded;
    private timer;
    private writing;
    private journalRows;
    private canAppend;
    private retryMs;
    private owners;
    constructor(file: string, decode: DecodeEntry);
    acquire(): void;
    release(): Promise<void>;
    private restore;
    private ready;
    get(key: string): Promise<CacheEntry | undefined>;
    set(key: string, entry: CacheEntry): void;
    private trim;
    private schedule;
    private flushOnce;
    private write;
}
export declare function openDiscoveryCache(file: string, decode: DecodeEntry): DiscoveryCache;
export {};
