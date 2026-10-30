/**
 * Terminal-only journal for deferred plugin operations (#411).
 *
 * A deferred mutation is deliberately not durable across a Host restart: the
 * maintenance holds and the package command die with the process. What has to
 * survive is the *report* — "the install you started last time failed" — so a
 * user coming back after a restart is not left guessing. This file stores
 * exactly the bounded terminal facts: id, kind, package name, state, Agent
 * counts and time. No prompts, transcripts, tool input, environment values, or
 * paths.
 */
import type { DrainJournalLike, DrainJournalRecord } from './drain.ts';
export declare class DrainJournal implements DrainJournalLike {
    private readonly file;
    private readonly maxBytes;
    private records;
    constructor(file: string, maxBytes?: number);
    /** Append one terminal record; the in-memory copy survives a write failure. */
    append(record: DrainJournalRecord): void;
    /** The newest terminal records, oldest first. */
    recent(max?: number): DrainJournalRecord[];
    private load;
    /** Keep the newest half, matching the persistent log's trim discipline. */
    private trim;
}
