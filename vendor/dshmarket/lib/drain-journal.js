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
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { redactHomePaths } from "./log-redaction.js";
const MAX_BYTES = 64 * 1024;
const MAX_RECORDS = 50;
const TEXT_MAX = 200;
const KINDS = new Set(['install', 'update', 'uninstall']);
const STATES = new Set(['succeeded', 'failed', 'cancelled']);
function clean(value, max = TEXT_MAX) {
    if (typeof value !== 'string')
        return null;
    const text = redactHomePaths(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return text === '' ? null : text.slice(0, max);
}
function parseLine(line) {
    let value;
    try {
        value = JSON.parse(line);
    }
    catch {
        return null;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return null;
    const row = value;
    const id = clean(row.id);
    const name = clean(row.name);
    const kind = row.kind;
    const state = row.state;
    if (id === null || name === null)
        return null;
    if (typeof kind !== 'string' || !KINDS.has(kind))
        return null;
    if (typeof state !== 'string' || !STATES.has(state))
        return null;
    if (typeof row.at !== 'number' || !Number.isFinite(row.at))
        return null;
    if (typeof row.agentsAtStart !== 'number' || typeof row.agentsAtEnd !== 'number')
        return null;
    return {
        at: row.at,
        id,
        kind: kind,
        name,
        state: state,
        agentsAtStart: row.agentsAtStart,
        agentsAtEnd: row.agentsAtEnd,
    };
}
/**
 * Whether the file is empty or its last byte is a newline — i.e. whether an
 * append starts a line of its own. Reads one byte rather than the file: this
 * runs on every completed operation, and the journal is bounded but not tiny.
 */
function endsWithNewline(file) {
    try {
        const size = statSync(file).size;
        if (size === 0)
            return true;
        const fd = openSync(file, 'r');
        try {
            const last = Buffer.alloc(1);
            readSync(fd, last, 0, 1, size - 1);
            return last[0] === 0x0a;
        }
        finally {
            closeSync(fd);
        }
    }
    catch {
        // No file yet (a fresh append creates it) or unreadable: appending a
        // leading newline to a missing file would only add a blank line.
        return true;
    }
}
export class DrainJournal {
    file;
    maxBytes;
    records = [];
    constructor(file, maxBytes = MAX_BYTES) {
        this.file = file;
        this.maxBytes = maxBytes;
        this.load();
    }
    /** Append one terminal record; the in-memory copy survives a write failure. */
    append(record) {
        const cleaned = {
            at: record.at,
            id: clean(record.id) ?? 'drain',
            kind: record.kind,
            name: clean(record.name) ?? 'plugin',
            state: record.state,
            agentsAtStart: Number.isFinite(record.agentsAtStart) ? record.agentsAtStart : 0,
            agentsAtEnd: Number.isFinite(record.agentsAtEnd) ? record.agentsAtEnd : 0,
        };
        this.records.push(cleaned);
        if (this.records.length > MAX_RECORDS)
            this.records.splice(0, this.records.length - MAX_RECORDS);
        mkdirSync(dirname(this.file), { recursive: true });
        // An interrupted write leaves a tail without its newline. Appending to it
        // would glue this record onto the damaged one, so the file would carry a
        // single unparseable line and BOTH would be lost on reopen — the record
        // this append just completed included (#1084). The damaged tail is
        // dropped by load() on its own; this only keeps the next record separate.
        appendFileSync(this.file, `${endsWithNewline(this.file) ? '' : '\n'}${JSON.stringify(cleaned)}\n`);
        if (existsSync(this.file) && statSync(this.file).size > this.maxBytes)
            this.trim();
    }
    /** The newest terminal records, oldest first. */
    recent(max = 10) {
        return this.records.slice(-max).map(record => ({ ...record }));
    }
    load() {
        try {
            if (!existsSync(this.file))
                return;
            const parsed = [];
            for (const line of readFileSync(this.file, 'utf8').split('\n')) {
                if (line === '')
                    continue;
                const record = parseLine(line);
                if (record !== null)
                    parsed.push(record);
            }
            this.records = parsed.slice(-MAX_RECORDS);
            if (statSync(this.file).size > this.maxBytes)
                this.trim();
        }
        catch {
            // An unreadable journal is a lost report, not a broken market.
            this.records = [];
        }
    }
    /** Keep the newest half, matching the persistent log's trim discipline. */
    trim() {
        try {
            const lines = readFileSync(this.file, 'utf8').split('\n').filter(line => line !== '');
            const kept = [];
            let bytes = 0;
            for (let index = lines.length - 1; index >= 0 && bytes <= this.maxBytes / 2; index -= 1) {
                kept.unshift(`${lines[index]}\n`);
                bytes += lines[index].length + 1;
            }
            writeFileSync(this.file, kept.join(''));
            this.records = kept
                .map(line => parseLine(line.trimEnd()))
                .filter((record) => record !== null);
        }
        catch {
            // Leave the file as it is; the in-memory tail still serves this process.
        }
    }
}
