import fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const V1_SCHEMA = 'dsh-market/discovery-compatibility-cache/v1';
const JOURNAL_HEADER = JSON.stringify({ schema: 'dsh-market/discovery-compatibility-cache/v2' });
// A full scan of the catalog must stay cached (#1170).
const MAX_ENTRIES = 20_000;
const COMPACT_AFTER = 2 * MAX_ENTRIES;
const BATCH_DELAY_MS = 100;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
async function readIfPresent(path) {
    try {
        return await fs.readFile(path, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return null;
        throw error;
    }
}
function encodeRows(entries) {
    return [...entries].map(([key, entry]) => JSON.stringify([key, entry]) + '\n').join('');
}
/**
 * A single writer and shared view per cache path. The old JSON remains readable
 * until a complete journal has been published. Later writes append only the
 * changed rows, with occasional atomic snapshots to bound the log.
 */
class DiscoveryCache {
    file;
    decode;
    journal;
    entries = new Map();
    pending = new Map();
    loaded;
    timer;
    writing;
    journalRows = 0;
    canAppend = false;
    retryMs = 0;
    owners = 0;
    constructor(file, decode) {
        this.file = file;
        this.decode = decode;
        this.journal = file + '.journal';
    }
    acquire() {
        this.owners += 1;
        this.schedule();
    }
    async release() {
        this.owners -= 1;
        if (this.owners !== 0)
            return;
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
        // Give a normal unload one immediate drain. A mounted replacement keeps
        // sharing the same writer even if it arrives before that drain completes.
        while (this.pending.size > 0 && await this.flushOnce()) {
            if (this.owners !== 0)
                break;
        }
        this.schedule();
    }
    async restore() {
        const journal = await readIfPresent(this.journal);
        const saved = new Map();
        const add = (key, raw) => {
            const entry = this.decode(raw);
            if (entry === null || (saved.get(key)?.checkedAt ?? -Infinity) > entry.checkedAt)
                return;
            saved.set(key, entry);
        };
        if (journal === null) {
            const legacy = await readIfPresent(this.file);
            const data = legacy === null ? null : parseJson(legacy);
            if (data?.schema === V1_SCHEMA && data.entries !== null && typeof data.entries === 'object' && !Array.isArray(data.entries)) {
                for (const [key, value] of Object.entries(data.entries))
                    add(key, value);
            }
        }
        else {
            const [header, ...rows] = journal.split('\n');
            if (header === JOURNAL_HEADER) {
                this.canAppend = true;
                this.journalRows = rows.length - 1;
                for (const row of rows) {
                    if (row === '')
                        continue;
                    const value = parseJson(row);
                    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string')
                        add(value[0], value[1]);
                }
            }
        }
        // A prior read error may have left locally refreshed entries in memory.
        // Replay must not replace them with old copies, including timestamp ties.
        for (const [key, entry] of saved) {
            if ((this.entries.get(key)?.checkedAt ?? -Infinity) < entry.checkedAt)
                this.entries.set(key, entry);
        }
        this.trim();
    }
    ready() {
        return this.loaded ??= this.restore();
    }
    async get(key) {
        await this.ready().catch(() => { });
        return this.entries.get(key);
    }
    set(key, entry) {
        if ((this.entries.get(key)?.checkedAt ?? -Infinity) > entry.checkedAt)
            return;
        this.entries.set(key, entry);
        this.pending.set(key, entry);
        this.schedule();
    }
    trim() {
        if (this.entries.size <= MAX_ENTRIES)
            return;
        const newest = [...this.entries].sort(([, a], [, b]) => b.checkedAt - a.checkedAt);
        for (const [key] of newest.slice(MAX_ENTRIES)) {
            this.entries.delete(key);
            this.pending.delete(key);
        }
    }
    schedule() {
        if (this.timer !== undefined || this.writing !== undefined)
            return;
        if (this.pending.size === 0) {
            if (this.owners === 0 && caches.get(this.file) === this)
                caches.delete(this.file);
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.flushOnce().then(() => { this.schedule(); });
        }, this.retryMs || BATCH_DELAY_MS);
        this.timer.unref();
    }
    flushOnce() {
        this.writing ??= this.write().then(() => {
            this.retryMs = 0;
            return true;
        }, () => {
            this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs === 0 ? MIN_RETRY_MS : this.retryMs * 2);
            return false;
        }).finally(() => { this.writing = undefined; });
        return this.writing;
    }
    async write() {
        try {
            await this.ready();
        }
        catch (error) {
            this.loaded = undefined;
            throw error;
        }
        this.trim();
        const batch = new Map(this.pending);
        if (batch.size === 0)
            return;
        if (!this.canAppend || this.journalRows + batch.size > COMPACT_AFTER) {
            const snapshot = JOURNAL_HEADER + '\n' + encodeRows(this.entries);
            const rows = this.entries.size;
            const temporary = this.journal + '.tmp';
            await fs.mkdir(dirname(this.journal), { recursive: true, mode: 0o700 });
            try {
                await fs.writeFile(temporary, snapshot, { mode: 0o600 });
                await fs.rename(temporary, this.journal);
            }
            catch (error) {
                await fs.rm(temporary, { force: true }).catch(() => { });
                throw error;
            }
            this.canAppend = true;
            this.journalRows = rows;
        }
        else {
            // Start at a fresh line even if an interrupted append left a partial
            // record behind. Recovery ignores malformed rows and keeps valid ones.
            await fs.appendFile(this.journal, '\n' + encodeRows(batch), { mode: 0o600 });
            this.journalRows += batch.size + 1;
        }
        for (const [key, entry] of batch) {
            if (this.pending.get(key) === entry)
                this.pending.delete(key);
        }
    }
}
const caches = new Map();
export function openDiscoveryCache(file, decode) {
    const path = resolve(file);
    let cache = caches.get(path);
    if (cache === undefined) {
        cache = new DiscoveryCache(path, decode);
        caches.set(path, cache);
    }
    cache.acquire();
    return cache;
}
