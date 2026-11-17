var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { isTeamComponent, TEAM_MANAGED_REASON, prepareKnownPluginCompatibility } from '../compatibility.js';
/**
 * Restart-free installs: mount a freshly installed plugin into the running
 * composition through a market-owned Include subtree.
 *
 * Durable state stays with the profile's `dsh.profile.bundles` (reconciled by
 * the dsh CLI at install time), so the next boot loads the plugin through the
 * normal bundle layer. The subtree here exists only for the current process:
 * its input files live under `<profile>/.dsh-market/` and are wiped on every
 * boot, so a crash can never leave a file that collides with the bundle layer
 * (inserting an id the bundle layer also inserts is a hard boot failure).
 * `state.json` in the same directory is the market's own durable state
 * (disable list + custom groups) and deliberately survives the wipe.
 *
 * The Include subclass suppresses `write()` — the loader otherwise persists
 * tree changes back to the file it read (see dsh's agent-presets PresetTree
 * for the in-tree precedent).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isUpdateCheckIntervalHours } from "./update-notification-settings.js";
import { asChannel } from "./channels.js";
import { asRegion, normalizeGithubProxy } from "./regions.js";
import { findDshInstallDir } from "./dsh-install.js";
import { logEvent } from "./log.js";
import { bundlePatchTargets, declaredBundlePatchFiles, entryArtifactExists } from "./profile.js";
/**
 * Profile-scoped resolution for hot-mount imports: turn a bare package name into
 * the absolute `file://` entry URL of the package just installed into
 * `profileDir`.
 *
 * Include-tree rows reach `Include.import` as BARE names (`name:
 * '@scope/pkg'`), and the base class resolves them against the LOADER's own
 * location — the host closure
 * (`closures/<fp>/node_modules/…/cordis-plugin-loader`), whose parent walk
 * can never reach `home/profiles/<profile>/node_modules/`. Under a host whose
 * loader sits in an immutable dependency closure, EVERY market hot mount dies
 * with `Cannot find module '<pkg>' from '…/cordis-plugin-loader/…'` and falls
 * back to "restart required", blaming the plugin for what is a resolution
 * anchor problem.
 *
 * Resolving the module at import time, against the profile it was actually
 * installed into, is anchor-independent: `require.resolve` walks
 * `profileDir/node_modules` natively, so the tree hands the loader a
 * `file://` URL needing no further resolution. Non-bare specifiers (relative
 * paths, `file://`, `cordis:` builtins) and names that do not resolve under
 * the profile pass through unchanged, preserving base-class semantics for
 * every shape this fix does not own.
 *
 * The fallback keeps the name bare rather than synthesising a URL: a package
 * whose entry cannot be located via `require.resolve` (no `main`/exports —
 * the market's own `entryArtifactExists` heuristic covers those shapes before
 * an install is accepted) is not something this resolver should guess about.
 * Client-only shims never reach this function: their import returns a no-op
 * host module before attempting package resolution.
 */
export function resolveProfileEntry(profileDir, name) {
    if (!name || name.startsWith('.') || name.startsWith('cordis:') || name.startsWith('file://'))
        return name;
    const packageDir = join(profileDir, 'node_modules', ...name.split('/'));
    try {
        return pathToFileURL(createRequire(join(profileDir, 'package.json')).resolve(name)).href;
    }
    catch {
        // require.resolve needs a resolvable package entry; the market's install
        // validation accepts a broader artifact set (exports objects, index.js).
        // Fall back to the index.js artifact so a valid mount is not refused over
        // resolver strictness — and keep the bare name when no checkable entry
        // exists, letting the loader produce its own (accurate) error.
        if (entryArtifactExists(packageDir)) {
            return pathToFileURL(join(packageDir, 'index.js')).href;
        }
        return name;
    }
}
// Row names and ids may contain apostrophes; YAML single-quoted scalars double them.
function yamlSingleQuoted(value) {
    return value.replace(/'/g, "''");
}
const HOT_DIR = '.dsh-market';
/**
 * Ceiling for one hot-mount activation, env-overridable like the install
 * timeout in dsh-cli.ts. An activation that exceeds it is treated as wedged
 * (typically a plugin pending on a service nothing provides) and falls back
 * to restart activation.
 */
const HOT_MOUNT_TIMEOUT_MS = Number(process.env.DSH_MARKET_HOT_MOUNT_TIMEOUT_MS) || 10000;
let hotTreeClass;
// Cordis declares FiberState as a const enum, so the installed host exposes its numeric values.
const FAILED_FIBER_STATE = 3;
/** Live hot-mount trees by input file URL, so an unmount can reach the entries. */
const hotTrees = new Map();
/** Package name -> the input file URL of its live hot mount. */
const hotTreeOf = new Map();
/**
 * The Include subclass, built once per process; null when the loader's include
 * plugin is not importable (older harness) — callers fall back to restart.
 */
/**
 * Packages whose host import is replaced by a no-op shim. Client-only plugins
 * (`dsh.client` without `dsh.bundle`) have no importable host half, but
 * client-modules only serves bundles for packages with a live loader entry —
 * the shim fiber exists purely to satisfy that registration.
 */
const shimNames = new Set();
async function loadHotTreeClass() {
    if (hotTreeClass !== undefined)
        return hotTreeClass;
    try {
        // Computed specifier: the include plugin ships with the harness (vendored,
        // unpublished), so it resolves at runtime through the profile fallback but
        // is not typecheckable as a dependency.
        const specifier = '@deepseek-ai/cordis-plugin-include';
        const mod = (await import(__rewriteRelativeImportExtension(specifier, true)));
        const Include = mod.Include;
        if (Include === undefined)
            throw new Error('no Include export');
        class MarketHotTree extends Include {
            profileDir;
            constructor(...args) {
                super(...args);
                const path = args[1].path;
                this.profileDir = dirname(dirname(fileURLToPath(path)));
                hotTrees.set(path, this);
            }
            /** Runtime-only mount list; the bundle layer owns persistence. */
            write() { }
            import(name, getOuterStack) {
                if (shimNames.has(name))
                    return { name, apply: () => { } };
                return super.import(resolveProfileEntry(this.profileDir, name), getOuterStack);
            }
        }
        hotTreeClass = MarketHotTree;
    }
    catch {
        hotTreeClass = null;
    }
    return hotTreeClass;
}
/** The `dsh` declaration block of an installed package, or null when unreadable. */
function readPkgDsh(profileDir, packageName) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir, 'node_modules', packageName, 'package.json'), 'utf8'));
        return manifest.dsh ?? {};
    }
    catch {
        return null;
    }
}
/**
 * Insert rows of a plugin's bundle patch, or null when the patch contains
 * anything beyond plain `id`/`name` insert rows (config blocks, disables,
 * expressions) — those compositions fall back to restart activation.
 */
export function parseSimplePatch(patchText) {
    const scan = scanPatch(patchText);
    return scan.blocker === null ? scan.rows : null;
}
export function scanPatch(patchText) {
    const rows = [];
    let pending = null;
    // A patch row at column 0 targets an EXISTING entry (the long-standing way
    // to disable one); only rows indented inside `- insert:` bring a plugin in.
    // Tracked so the walk can say which of the two it met instead of calling
    // every top-level row "a config block" (#1102, dsh-mnemon's shipped patch).
    let topLevelRow = false;
    // Split on CRLF too. `#.*$` cannot strip a comment that ends in \r —
    // JS treats \r as a line terminator, so `.` will not cross it and `$`
    // only anchors at the very end — leaving the comment text in place,
    // matching none of the row shapes, and failing the whole patch. Any
    // plugin whose patch was authored on Windows then reads as
    // "contains config/expression rows" and can never hot-mount.
    for (const raw of patchText.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trimEnd();
        if (line.trim() === '')
            continue;
        if (/^-\s+insert:\s*$/.test(line))
            continue;
        if (/^-\s+id:\s*\S+\s*$/.test(line)) {
            topLevelRow = true;
            continue;
        }
        const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line);
        if (id !== null) {
            // A second id before the first got its name: the row was cut short.
            if (pending !== null)
                return { rows, blocker: 'incomplete' };
            pending = id[1];
            continue;
        }
        const name = /^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
        if (name !== null && pending !== null) {
            rows.push({ id: pending, name: name[1] });
            pending = null;
            continue;
        }
        const leaf = /^\s*(?:-\s+)?([A-Za-z_][\w-]*)\s*:/.exec(line);
        const key = leaf?.[1];
        if (key === 'config')
            return { rows, blocker: 'config', key };
        if (key === 'disabled' || key === 'enabled')
            return { rows, blocker: 'disabled', key };
        return { rows, blocker: 'other', key };
    }
    if (pending !== null)
        return { rows, blocker: 'incomplete' };
    // A top-level row whose body never arrived: still not an insert list, and
    // saying so keeps `parseSimplePatch` from mounting the inserts around it
    // while silently dropping the entry it patched.
    if (topLevelRow)
        return { rows, blocker: 'other', key: 'id' };
    if (rows.length === 0)
        return { rows, blocker: 'empty' };
    return { rows, blocker: null };
}
/**
 * One sentence for a refusal that is only about the patch's shape, naming the
 * cause and what happens next. Shared by the hot mount and the activation
 * verdict so the two cannot drift apart on the same fact again.
 */
export function patchBlockerReason(blocker, key) {
    switch (blocker) {
        case 'config':
            return 'bundle patch 里有 config 块,热挂载只重放纯 insert 行;重启后由 bundle 层按原样加载 / the bundle patch has a config block; hot-mount replays plain insert rows only — a restart loads the bundle as written';
        case 'disabled':
            return '这个包有一行被关掉了(disabled),热挂载不重放开关行;重启后按原样加载,那一行仍然是关的 / one of its rows is switched off (disabled); hot-mount does not replay switch rows — a restart loads the bundle as written and that row stays off';
        case 'incomplete':
            return 'bundle patch 里有一行 id 没有配 name,市场读不懂这一行;重启后由 bundle 层按原样加载,仍不生效就修这个包的 patch / a row has an id but no name, so the market cannot read it — a restart loads the bundle as written; fix the package patch if it still does not work';
        case 'empty':
            return 'bundle patch 里没有 insert 行,热挂载没有可重放的内容;重启后由 bundle 层生效 / the bundle patch has no insert rows, so there is nothing to replay — it activates on restart';
        default:
            return `bundle patch 里有 insert 之外的行(${key ?? '未识别的键'}),热挂载只重放纯 insert;重启后由 bundle 层按原样加载 / the bundle patch has a row beyond plain inserts (${key ?? 'an unrecognised key'}); hot-mount replays plain inserts only — a restart loads the bundle as written`;
    }
}
/**
 * Wipe leftover hot-mount inputs; call once when the market host starts.
 * `state.json` (disable choices + groups) deliberately survives.
 */
export function cleanHotDir(profileDir) {
    const dir = join(profileDir, HOT_DIR);
    let entries;
    try {
        entries = readdirSync(dir);
    }
    catch {
        return;
    }
    for (const name of entries) {
        if (/^hot-\d+\.yml$/.test(name))
            rmSync(join(dir, name), { force: true });
    }
}
function stateFile(profileDir) {
    return join(profileDir, HOT_DIR, 'state.json');
}
const BROKEN_REASONS = new Set(['incomplete-build-locked', 'incomplete-build-cancelled']);
/** The on-disk shape of {@link MarketState.brokenPlugins}, sanitized. */
function brokenPluginsFromUnknown(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const out = {};
    for (const [name, raw] of Object.entries(value)) {
        if (name === '' || raw === null || typeof raw !== 'object' || Array.isArray(raw))
            continue;
        const record = raw;
        if (typeof record.reason !== 'string' || !BROKEN_REASONS.has(record.reason))
            continue;
        out[name] = {
            spec: typeof record.spec === 'string' ? record.spec.slice(0, MAX_NOTE) : '',
            reason: record.reason,
            at: typeof record.at === 'string' ? record.at : '',
        };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
/** Unique non-empty strings in `value`, order preserved. */
function uniqueStrings(value) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string' || item === '' || seen.has(item))
            continue;
        seen.add(item);
        out.push(item);
    }
    return out;
}
/** Upper bound on bookmarked catalog URLs kept in state.json (#414). */
export const MAX_FAVORITES = 500;
/** Upper bound on blocked package names kept in state.json (#657). */
export const MAX_BLOCKED = 500;
/** Upper bound on the persistent do-not-remind list (#728). */
export const MAX_UPDATE_EXEMPT = 500;
/** npm package names are at most 214 characters. Longer values are not names. */
export const MAX_BLOCKED_NAME = 214;
/** Catalog URLs the user may favorite; http(s) only, order preserved. */
function favoriteUrls(value) {
    return uniqueStrings(value).filter(url => url.startsWith('http://') || url.startsWith('https://'));
}
/** Package names, non-empty, order preserved, capped. */
function cappedPackageNames(value, cap) {
    const trimmed = Array.isArray(value)
        ? value.map(item => typeof item === 'string' ? item.slice(0, MAX_BLOCKED_NAME) : item)
        : value;
    return uniqueStrings(trimmed).slice(0, cap);
}
/** Package names the user may block. */
function blockedNames(value) {
    return cappedPackageNames(value, MAX_BLOCKED);
}
/** Package names the user may stop being reminded about. */
function updateExemptNames(value) {
    return cappedPackageNames(value, MAX_UPDATE_EXEMPT);
}
/**
 * Upper bound on the install-time map (#1142). One entry per package the
 * market itself installed, and a profile with 500 of those is already an
 * outlier; the cap keeps state.json from growing with every plugin the user
 * ever tried and removed.
 */
export const MAX_INSTALL_TIMES = 500;
/** An ISO 8601 timestamp, normalized; anything else is "not recorded". */
function installTimestamp(value) {
    if (typeof value !== 'string' || value === '')
        return undefined;
    const at = Date.parse(value);
    if (!Number.isFinite(at))
        return undefined;
    return new Date(at).toISOString();
}
/**
 * Sanitize the stored install-time map. A hand-edited file is not trusted:
 * a key that is not a name, a value that is not an object, and a stamp that
 * is not a timestamp are all dropped rather than carried into the UI, where
 * an unparseable date would sort as `NaN` and land in the middle of the list.
 *
 * The cap keeps the entries with the most recent activity, not the first
 * ones written: the map is a lookup for "when did I install this", and the
 * oldest 50 installs are exactly the ones nobody is asking about.
 */
function installTimesFromUnknown(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const out = {};
    for (const [name, raw] of Object.entries(value)) {
        if (name === '' || name.length > MAX_BLOCKED_NAME)
            continue;
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
            continue;
        const record = raw;
        const installedAt = installTimestamp(record.installedAt);
        const updatedAt = installTimestamp(record.updatedAt);
        // An entry with neither stamp says nothing; keeping it would list a row
        // that looks known and sorts nowhere.
        if (installedAt === undefined && updatedAt === undefined)
            continue;
        out[name] = {
            ...(installedAt === undefined ? {} : { installedAt }),
            ...(updatedAt === undefined ? {} : { updatedAt }),
        };
    }
    const names = Object.keys(out);
    if (names.length === 0)
        return undefined;
    return trimInstallTimes(out);
}
/** Keep the cap, dropping the entries nobody is asking about (oldest first). */
function trimInstallTimes(map) {
    const names = Object.keys(map);
    if (names.length === 0)
        return undefined;
    if (names.length <= MAX_INSTALL_TIMES)
        return map;
    const stamp = (entry) => Date.parse(entry.updatedAt ?? entry.installedAt ?? '');
    const recent = names.sort((a, b) => stamp(map[b]) - stamp(map[a])).slice(0, MAX_INSTALL_TIMES);
    return Object.fromEntries(recent.map(name => [name, map[name]]));
}
/** A POSIX-looking environment variable name: the name part of `KEY=value`. */
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Upper bound on one pinned env value, so state.json cannot balloon. */
const MAX_ENV_VALUE = 4096;
/**
 * Sanitize an untrusted build-env map (state.json, or the card route's body)
 * into the shape spawnEnv can merge.
 *
 * An empty map and a non-object both read as undefined: clearing the card
 * must inherit the composition, and a blank line in state.json must not
 * disable every pinned variable. Only the merge precedence in
 * src/dsh-cli.ts spawnEnv — never this — protects PATH and CI, but a value
 * a user typed for them would silently do nothing there, so it is rejected
 * here with a reason instead.
 *
 * `GIT_ASKPASS` and `SSH_ASKPASS` are deliberately NOT rejected, though they
 * are the two names that can re-open a credential prompt: pointing them at a
 * program is the supported non-interactive way to answer one, and #587/#596
 * close the *terminal* fallback (GIT_TERMINAL_PROMPT, BatchMode) rather than
 * the program one. A user who pins these has already said where the answer
 * comes from; a user who does not still gets the closed prompt.
 */
export function buildEnvFromUnknown(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!ENV_KEY_RE.test(key))
            continue;
        if (key === 'PATH' || key === 'CI')
            continue;
        if (typeof raw !== 'string')
            continue;
        const entry = raw.trim();
        if (entry === '')
            continue;
        out[key] = entry.slice(0, MAX_ENV_VALUE);
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
/**
 * Read the whole market state. Legacy `disabledSkins` (the pre-#60
 * theme-only key) still loads; every new write uses the generic `disabled`
 * key (#60).
 */
/** A note is a label, not a document: one line, bounded so state.json cannot
 * grow without limit from a paste. */
export const MAX_NOTE = 200;
export function readMarketState(profileDir) {
    try {
        const state = JSON.parse(readFileSync(stateFile(profileDir), 'utf8'));
        const disabled = uniqueStrings(state.disabled !== undefined ? state.disabled : state.disabledSkins);
        const groups = {};
        if (state.groups !== null && typeof state.groups === 'object' && !Array.isArray(state.groups)) {
            for (const [name, members] of Object.entries(state.groups)) {
                groups[name] = uniqueStrings(members);
            }
        }
        const notes = {};
        if (state.notes !== null && typeof state.notes === 'object' && !Array.isArray(state.notes)) {
            for (const [name, text] of Object.entries(state.notes)) {
                // Empty is the same as absent: clearing a note must not leave a row
                // claiming to carry one.
                if (typeof text === 'string' && text.trim() !== '')
                    notes[name] = text.slice(0, MAX_NOTE);
            }
        }
        const githubProxy = normalizeGithubProxy(state.githubProxy);
        const brokenPlugins = brokenPluginsFromUnknown(state.brokenPlugins);
        const installTimes = installTimesFromUnknown(state.installTimes);
        // The order and the map are two halves of one fact, and a state file can
        // carry them out of step (#964): the UI then lists a group the routes
        // cannot find, so "assign to" and even "delete" answer group-not-found
        // forever. Normalize on read — a name with no group disappears from the
        // order, and a group with no order entry gets one appended — so the two
        // cannot disagree however the file got that way.
        const groupOrder = uniqueStrings(state.groupOrder).filter(name => groups[name] !== undefined);
        for (const name of Object.keys(groups)) {
            if (!groupOrder.includes(name))
                groupOrder.push(name);
        }
        return {
            disabled: new Set(disabled),
            groups,
            notes,
            groupOrder,
            channel: asChannel(state.channel) ?? undefined,
            region: asRegion(state.region) ?? undefined,
            // Only meaningful beside a region, and only when true: a stray flag
            // with no region would promise a notice about a choice nobody made.
            regionAuto: state.regionAuto === true && asRegion(state.region) !== null ? true : undefined,
            favorites: favoriteUrls(state.favorites),
            blocked: blockedNames(state.blocked),
            updateExempt: updateExemptNames(state.updateExempt),
            ...(typeof state.backgroundUpdateChecks === 'boolean' ? { backgroundUpdateChecks: state.backgroundUpdateChecks } : {}),
            ...(isUpdateCheckIntervalHours(state.backgroundUpdateIntervalHours) ? { backgroundUpdateIntervalHours: state.backgroundUpdateIntervalHours } : {}),
            ...(githubProxy === null ? {} : { githubProxy }),
            ...(brokenPlugins === undefined ? {} : { brokenPlugins }),
            ...(installTimes === undefined ? {} : { installTimes }),
            // true AND false are both preserved: on a host with no settings page
            // this switch is the market's only entry, so "the user turned it off"
            // must be distinguishable from "nobody has chosen yet" (#846).
            ...(typeof state.sidebarEntry === 'boolean' ? { sidebarEntry: state.sidebarEntry } : {}),
            // Only `false` is a stored answer here: shown is the default, and a
            // state file that says anything else reads as "never touched".
            ...(state.settingsSection === false ? { settingsSection: false } : {}),
            ...(state.pluginsTab === false ? { pluginsTab: false } : {}),
            buildEnv: buildEnvFromUnknown(state.buildEnv),
        };
    }
    catch (error) {
        // An unreadable state file is the profile's whole market state gone: every
        // disable, group, favourite and exemption in it. Say so — silently coming
        // back empty reads to the user as "my disabled plugins all switched
        // themselves on", with nothing anywhere connecting the two (#582's
        // narrowest surviving point). Writing it back afterwards replaces the
        // damaged file, so the log is the only trace there will be.
        if (!(error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
            logEvent('warn', 'state', `market state could not be read (${error instanceof Error ? error.message : String(error)}) — starting from an empty state`);
        }
        return { disabled: new Set(), groups: {}, groupOrder: [], notes: {}, favorites: [], blocked: [], updateExempt: [] };
    }
}
/**
 * Publish a file so that a reader never sees it half-written.
 *
 * The state file carries every choice the user made about their plugins, and
 * it is written on each switch: a process killed or a disk that fills up
 * mid-write used to leave truncated JSON behind, which reads as an empty
 * state — all of it gone, silently. A rename is atomic within one filesystem,
 * so readers see either the old file or the new one.
 *
 * A symlinked state file is followed rather than replaced (#582): the write
 * lands on the link's target, so a user who keeps their profile state
 * somewhere else keeps it there.
 */
function publishFile(path, contents) {
    const target = (() => {
        try {
            return realpathSync(path);
        }
        catch {
            return path;
        }
    })();
    const temporary = `${target}.new`;
    writeFileSync(temporary, contents);
    try {
        renameSync(temporary, target);
    }
    catch (error) {
        rmSync(temporary, { force: true });
        throw error;
    }
}
/**
 * Persist the whole market state.
 *
 * Every field a caller does not carry forward is taken from disk rather than
 * dropped. Several callers legitimately know about only one part of the
 * state — `writeMarketState(dir, { disabled, groups, groupOrder })` appears
 * at five call sites in routes.ts — and before #435 that shape silently
 * erased whatever else the user had chosen:
 *
 * - `channel` and `region` had no fallback at all, so toggling any plugin
 *   threw away the user's update channel and download region. Both are
 *   deliberate choices made through the settings card, and neither has a
 *   "clear it" path: once picked they only ever move to another value. So
 *   an absent one always means "the caller has nothing to say", never
 *   "the user unchose it".
 * `notes` keeps its original rule — an explicit object wins, including an
 * empty one, because deleting the last note has to be expressible. What made
 * #435 lose notes was not this function but a caller: the note route wrote
 * through a fresh read while the long-lived `marketState` in routes.ts still
 * carried `notes: {}` from boot, and the next write from that object put the
 * empty one back. The fix for that belongs at the call site, where the two
 * copies are, not here — see the note route.
 *
 * Reading before writing costs one small JSON parse on an operation that is
 * already doing filesystem work, and it is what makes "this function writes
 * the whole document" safe for callers that only hold part of it.
 */
export function writeMarketState(profileDir, state) {
    writeState(profileDir, state, false);
}
/**
 * `ownStamps` is true only for the three stamp functions below. Every other
 * writer holds a whole-state object that may be minutes old (the routes keep
 * one from boot and save it whole, #435), so a stamp it carries is a stale
 * copy: letting it through put the install date of the last install back to
 * what boot saw.
 */
function writeState(profileDir, state, ownStamps) {
    mkdirSync(join(profileDir, HOT_DIR), { recursive: true, mode: 0o700 });
    const onDisk = readMarketState(profileDir);
    // `?? {}` only for the type: MarketState declares notes optional, while
    // readMarketState always returns an object.
    const notes = state.notes ?? onDisk.notes ?? {};
    const channel = state.channel ?? onDisk.channel;
    const region = state.region ?? onDisk.region;
    // Unlike channel and region, regionAuto has an explicit clear path: a
    // manual region choice owns this field and sets it to undefined. Preserve
    // the disk value only when the caller omitted the property entirely.
    const regionAuto = Object.prototype.hasOwnProperty.call(state, 'regionAuto')
        ? state.regionAuto
        : onDisk.regionAuto;
    const favorites = state.favorites ?? onDisk.favorites ?? [];
    const blocked = state.blocked ?? onDisk.blocked ?? [];
    const updateExempt = state.updateExempt ?? onDisk.updateExempt ?? [];
    const backgroundUpdateChecks = state.backgroundUpdateChecks ?? onDisk.backgroundUpdateChecks;
    const backgroundUpdateIntervalHours = state.backgroundUpdateIntervalHours ?? onDisk.backgroundUpdateIntervalHours;
    // This field does have a clear action ("restore automatic"). As with
    // regionAuto, omission preserves while an explicit undefined removes it.
    const githubProxy = Object.prototype.hasOwnProperty.call(state, 'githubProxy')
        ? state.githubProxy
        : onDisk.githubProxy;
    const broken = Object.prototype.hasOwnProperty.call(state, 'brokenPlugins')
        ? state.brokenPlugins
        : onDisk.brokenPlugins;
    // Only the stamp functions replace the map (an empty one, after the last
    // uninstall, included); every other writer leaves what is on disk alone.
    const installTimes = ownStamps ? state.installTimes : onDisk.installTimes;
    const sidebarEntry = Object.prototype.hasOwnProperty.call(state, 'sidebarEntry')
        ? state.sidebarEntry
        : onDisk.sidebarEntry;
    // Shown is the default, so only `false` needs writing. An omitted field
    // still falls back to disk: partial callers must not erase the choice.
    const settingsSection = Object.prototype.hasOwnProperty.call(state, 'settingsSection')
        ? state.settingsSection
        : onDisk.settingsSection;
    const pluginsTab = Object.prototype.hasOwnProperty.call(state, 'pluginsTab')
        ? state.pluginsTab
        : onDisk.pluginsTab;
    publishFile(stateFile(profileDir), JSON.stringify({
        disabled: [...state.disabled],
        groups: state.groups,
        groupOrder: state.groupOrder,
        ...(favorites.length > 0 ? { favorites } : {}),
        ...(blocked.length > 0 ? { blocked } : {}),
        ...(updateExempt.length > 0 ? { updateExempt } : {}),
        ...(typeof backgroundUpdateChecks === 'boolean' ? { backgroundUpdateChecks } : {}),
        ...(isUpdateCheckIntervalHours(backgroundUpdateIntervalHours) ? { backgroundUpdateIntervalHours } : {}),
        ...(Object.keys(notes).length > 0 ? { notes } : {}),
        // Omitted while unchosen, so "never picked" survives a round trip and
        // keeps deriving from the running build — but only when disk has not
        // recorded a choice either.
        ...(channel === undefined ? {} : { channel }),
        // Same reasoning, different consequence: an absent region is what makes
        // the probe run, so writing a default here would mean it never does.
        ...(region === undefined ? {} : { region }),
        ...(regionAuto === true ? { regionAuto: true } : {}),
        ...(githubProxy === undefined ? {} : { githubProxy }),
        // Omission preserves, explicit undefined clears — the same contract as
        // githubProxy above, and the one a repaired plugin needs: the entry
        // exists only while the declaration is still missing.
        ...(broken === undefined ? {} : { brokenPlugins: broken }),
        // Omitted while empty, so a profile that never installed through the
        // market keeps a state file with no such key at all.
        ...(installTimes === undefined || Object.keys(installTimes).length === 0 ? {} : { installTimes }),
        // Written for both answers: on a host with no settings page this switch
        // is the market's only entry, so a deliberate OFF has to survive a reload
        // instead of being read back as "never chosen" (#846).
        ...(typeof sidebarEntry === 'boolean' ? { sidebarEntry } : {}),
        // Only the OFF is written; `true` means "the default", so re-enabling
        // clears the field rather than pinning today's default forever (#1015).
        ...(settingsSection === false ? { settingsSection: false } : {}),
        ...(pluginsTab === false ? { pluginsTab: false } : {}),
        ...(state.region === undefined ? {} : { region: state.region }),
        ...(state.regionAuto === true ? { regionAuto: true } : {}),
        // Omitted while not saved, so a card that was never touched keeps
        // inheriting the composition's buildEnv on every boot.
        ...(state.buildEnv === undefined ? {} : { buildEnv: state.buildEnv }),
    }));
}
/** Plugins the user switched off; skipped by the boot re-mount. */
export function readDisabled(profileDir) {
    return readMarketState(profileDir).disabled;
}
/** Persist just the disable list, preserving groups and order. */
export function writeDisabled(profileDir, disabled) {
    const state = readMarketState(profileDir);
    state.disabled = new Set(disabled);
    writeMarketState(profileDir, state);
}
/** @deprecated theme-specific alias — kept for pre-#60 callers. */
export function readDisabledThemes(profileDir) {
    return readDisabled(profileDir);
}
/** @deprecated theme-specific alias — kept for pre-#60 callers. */
export function writeDisabledThemes(profileDir, disabled) {
    writeDisabled(profileDir, disabled);
}
/**
 * The market installed these packages just now (#1142): both stamps are this
 * moment, because the first install is also the last change so far.
 */
export function recordInstalled(profileDir, names, at = new Date()) {
    const stamp = at.toISOString();
    const state = readMarketState(profileDir);
    const map = { ...state.installTimes };
    for (const name of names) {
        if (name === '')
            continue;
        map[name] = { installedAt: stamp, updatedAt: stamp };
    }
    state.installTimes = trimInstallTimes(map);
    writeState(profileDir, state, true);
}
/**
 * An update of these packages landed: only the update stamp moves.
 *
 * A package with no entry keeps `installedAt` absent — the market never saw
 * it installed, and "when I first noticed it" is a different fact. Writing it
 * here would make the sort report a guessed install order as history.
 */
export function recordUpdated(profileDir, names, at = new Date()) {
    const stamp = at.toISOString();
    const state = readMarketState(profileDir);
    const map = { ...state.installTimes };
    for (const name of names) {
        if (name === '')
            continue;
        map[name] = { ...map[name], updatedAt: stamp };
    }
    state.installTimes = trimInstallTimes(map);
    writeState(profileDir, state, true);
}
/** The package is gone: its stamps must not outlive it. */
export function forgetInstalled(profileDir, name) {
    const state = readMarketState(profileDir);
    if (state.installTimes === undefined || state.installTimes[name] === undefined)
        return;
    const map = { ...state.installTimes };
    delete map[name];
    state.installTimes = trimInstallTimes(map);
    writeState(profileDir, state, true);
}
/** Package names whose hot-mount trees are still attached and can be removed. */
export function listHotMounts() {
    return [...hotHandles.keys()];
}
function mountedFile(packageName, profileDir) {
    const file = hotTreeOf.get(packageName);
    if (file === undefined || profileDir === undefined)
        return file;
    return dirname(fileURLToPath(file)) === join(profileDir, HOT_DIR) ? file : undefined;
}
/** Report a failed child only when it belongs to this package's hot-mount tree. */
export function hotMountFailure(packageName, profileDir) {
    const file = mountedFile(packageName, profileDir);
    if (file === undefined)
        return null;
    const tree = hotTrees.get(file);
    if (typeof tree?.entries !== 'function')
        return null;
    const failed = [];
    try {
        for (const entry of tree.entries()) {
            if (entry.fiber?.state === FAILED_FIBER_STATE && typeof entry.id === 'string')
                failed.push(entry.id);
        }
    }
    catch {
        // Older loaders can have an unreadable activation state.
        return null;
    }
    if (failed.length === 0)
        return null;
    const components = failed.join(', ');
    return `组件 ${components} 启动失败。请在诊断中查看原因。 / Components failed to start (${components}). Check Diagnostics for the error.`;
}
/** Hot mounts the market can report as live. */
export function listLiveHotMounts() {
    return listHotMounts().filter(name => hotMountFailure(name) === null);
}
let hotSequence = 0;
const hotHandles = new Map();
/** Activation did not settle within HOT_MOUNT_TIMEOUT_MS. */
class ActivationTimeout extends Error {
}
/** Disposal did not settle within HOT_MOUNT_TIMEOUT_MS (see `hotUnmount`). */
class DisposalTimeout extends Error {
}
/**
 * Race an activation awaitable against the hot-mount ceiling. The handlers
 * stay attached to the original promise, so a late rejection after a timeout
 * can never surface as an unhandled rejection.
 */
function raceActivationTimeout(awaitable) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new ActivationTimeout(`activation did not settle within ${HOT_MOUNT_TIMEOUT_MS / 1000}s — the plugin may be waiting on a service that never arrives`));
        }, HOT_MOUNT_TIMEOUT_MS);
        Promise.resolve(awaitable).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
}
/** Cap on host log lines attached to one hot mount (#1197). */
const MOUNT_LOG_MAX = 5;
const MOUNT_LOG_LINE_MAX = 200;
/** Render one structured host record as a single log line. */
function mountLogLine(message) {
    const parts = Array.isArray(message.args) ? message.args : [message.args];
    const text = parts
        .filter(part => part !== undefined && part !== null)
        .map(part => {
        if (typeof part === 'string')
            return part;
        // Align with `Logger.format`: an Error records its stack (or message as
        // a fallback), never the empty object `JSON.stringify` yields. cordis'
        // `_method` hands the raw `args: [Error]` to exporters without
        // formatting, so this is what keeps `the host logged this while
        // mounting — name: Error: ...` readable in the exportable log.
        if (part instanceof Error)
            return part.stack || part.message;
        try {
            return JSON.stringify(part) ?? String(part);
        }
        catch {
            return String(part);
        }
    })
        .join(' ');
    const name = typeof message.name === 'string' && message.name !== '' ? `${message.name}: ` : '';
    return `${name}${text}`.slice(0, MOUNT_LOG_LINE_MAX);
}
/**
 * Collect the host's warn/error records for the duration of one hot mount.
 *
 * `Fiber#await()` resolves normally when an entry is still waiting on a
 * service that never arrives (#1197): the mount reports live, and the only
 * trace of the problem is whatever the host logged while composing it.
 * Recording those lines next to the `live` event keeps that trace in the
 * exportable log without changing the verdict — the mount really did finish,
 * and "this entry was the one that complained" is not something the market can
 * prove yet.
 *
 * Attribution stays open on purpose: the exporter is process-wide, so these
 * lines read as "logged while mounting", not as this entry's own records.
 * Filtering on a name prefix would bake in a naming contract the host has not
 * promised.
 *
 * @param ctx - host context; the sink is skipped when there is no `exporter`.
 * @returns the collected lines plus a disposer that is safe to call twice.
 */
function watchMountLog(ctx) {
    const logger = ctx.logger;
    const register = logger?.exporter;
    if (logger === undefined || typeof register !== 'function')
        return { finish: () => [], stop: () => { } };
    const lines = [];
    let disposable;
    try {
        disposable = register.call(logger, {
            // Ask for every level and filter below: the sink exists to catch
            // warnings, and the service's own default threshold (`1`) drops them
            // before `export` is ever called.
            levels: { default: 3 },
            export(message) {
                if (lines.length >= MOUNT_LOG_MAX)
                    return;
                if (message?.type !== 'warn' && message?.type !== 'error')
                    return;
                lines.push(mountLogLine(message));
            },
        });
    }
    catch {
        // A host whose exporter rejects this sink shape is not a mount failure.
        return { finish: () => [], stop: () => { } };
    }
    let stopped = false;
    const stop = () => {
        if (stopped)
            return;
        stopped = true;
        try {
            if (typeof disposable === 'function')
                void disposable();
            else if (disposable !== null && typeof disposable === 'object' && 'dispose' in disposable) {
                void disposable.dispose();
            }
        }
        catch {
            // The mount result matters more than the sink teardown.
        }
    };
    return {
        finish: () => {
            stop();
            return lines.slice();
        },
        stop,
    };
}
function mountResult(failure) {
    return failure === null ? { ok: true, reason: null } : { ok: false, reason: failure, retained: true };
}
/**
 * Dispose a plugin hot-mounted earlier in this session, removing it from the
 * running composition immediately.
 * @param packageName - package to unmount.
 * @returns true when a live hot mount was found and disposed.
 */
export async function hotUnmount(packageName) {
    const handle = hotHandles.get(packageName);
    if (handle === undefined)
        return false;
    // Dropped from the table BEFORE the wait, so a teardown that never finishes
    // cannot keep this package registered: a later attempt starts from clean
    // state instead of reusing a handle already being disposed.
    hotHandles.delete(packageName);
    shimNames.delete(packageName);
    const treeKey = hotTreeOf.get(packageName);
    hotTreeOf.delete(packageName);
    const tree = treeKey === undefined ? undefined : hotTrees.get(treeKey);
    if (treeKey !== undefined)
        hotTrees.delete(treeKey);
    const disposal = Promise.resolve().then(async () => {
        // Switch the tree's entries off BEFORE disposing the tree (#1188).
        // Disposing the tree stops the plugins but leaves each entry still holding
        // its fiber, and the host's client-module registry keeps serving a package
        // to the page for as long as an entry names a live fiber: the browser half
        // of a plugin switched off here stayed on screen, across reloads, until
        // the host restarted. Updating the entry itself is the path the host's own
        // entries take when they are switched off, and the registry follows it.
        if (tree !== undefined) {
            for (const entry of [...tree.entries()]) {
                try {
                    await entry.update({ disabled: true }, false, true);
                }
                catch { /* the dispose below still stops it */ }
            }
        }
        await handle.dispose();
    });
    // Same ceiling as mounting, and the same reason (#582, measured class of
    // report): a plugin whose teardown waits for something that never arrives
    // used to hold the toggle route open forever, and every later operation
    // queued behind the lock it never released — the UI simply stopped
    // answering until the host restarted. Handlers stay attached to the
    // original promise, so a late settlement is logged rather than surfacing
    // as an unhandled rejection.
    let answered = false;
    void disposal.then(() => { if (answered)
        logEvent('info', 'hot-unmount', `${packageName}: teardown finished after the wait`); }, (error) => {
        logEvent('warn', 'hot-unmount', `${packageName}: dispose failed${answered ? ' after the wait' : ''} — ${error instanceof Error ? error.message : String(error)}`);
    });
    let timer;
    try {
        await Promise.race([
            disposal,
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new DisposalTimeout(`${packageName}: teardown did not settle within ${HOT_MOUNT_TIMEOUT_MS / 1000}s`)), HOT_MOUNT_TIMEOUT_MS);
            }),
        ]);
        answered = true;
        logEvent('info', 'hot-unmount', `${packageName}: removed live`);
        return true;
    }
    catch (error) {
        answered = true;
        if (error instanceof DisposalTimeout) {
            logEvent('warn', 'hot-unmount', `${packageName}: its teardown did not settle within ${HOT_MOUNT_TIMEOUT_MS / 1000}s, so it could not be confirmed stopped — it is off from the next start`);
        }
        else {
            logEvent('warn', 'hot-unmount', `${packageName}: dispose failed — ${error instanceof Error ? error.message : String(error)}`);
        }
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Mount `packageName` (just installed into the profile) into the running
 * composition.
 * @param ctx - market host context; the subtree unwinds with the market's fiber.
 * @param profileDir - profile the package was installed into.
 * @param packageName - installed package to activate.
 * @returns whether the plugin is live without a restart, plus the reason
 * when it is not (P0-2: the UI must distinguish "restart will fix it" from
 * "this package can never hot-mount").
 */
export async function hotMount(ctx, profileDir, packageName) {
    if (isTeamComponent(packageName))
        return { ok: false, reason: TEAM_MANAGED_REASON };
    const compatibility = prepareKnownPluginCompatibility(profileDir, packageName);
    if (!['compatible', 'irrelevant'].includes(compatibility.status))
        return { ok: false, reason: compatibility.reason };
    try {
        if (mountedFile(packageName, profileDir) !== undefined) {
            return mountResult(hotMountFailure(packageName, profileDir));
        }
        const HotTree = await loadHotTreeClass();
        if (HotTree === null) {
            return {
                ok: false,
                reason: '宿主不支持热挂载(include 插件不可导入),需重启 / the host cannot hot-mount (include plugin unavailable); restart required',
            };
        }
        // Where the patch lives is the PACKAGE's decision, declared as
        // `dsh.bundle.patch` — `aegis` keeps it in `./extensions/dsh/`. Reading
        // only the package root made a plugin whose patch is declared elsewhere
        // look like one with no bundle at all, and the user was told "no bundle
        // patch … nothing to hot-mount" for a package that plainly has one
        // (#646). The root file stays as the fallback: it is the long-standing
        // convention, and `profile.ts` resolves the declared field for everything
        // else, so the two now agree on where a patch is. #792: the declaration
        // may also be a LIST of files, which the host composes in order — read
        // every declared one and parse the concatenation, all or nothing: the
        // host throws on one missing overlay file and skips the entire bundle.
        const packageRoot = join(profileDir, 'node_modules', packageName);
        const declared = declaredBundlePatchFiles(packageRoot);
        const sources = declared.length > 0 ? declared : [join(packageRoot, 'cordis.patch.yml')];
        let texts = [];
        for (const file of sources) {
            try {
                texts.push(readFileSync(file, 'utf8'));
            }
            catch {
                // All or nothing, same rule as readBundlePatchRows: one unreadable
                // file voids the whole declaration — the host drops the entire
                // bundle for one missing overlay file, so mounting the readable
                // remainder would show live what the next boot never loads.
                texts = null;
                break;
            }
        }
        let rows;
        if (texts !== null && texts.length > 0) {
            const scan = scanPatch(texts.join('\n'));
            if (scan.blocker !== null) {
                return {
                    ok: false,
                    deferred: true,
                    reason: patchBlockerReason(scan.blocker, scan.key),
                };
            }
            rows = scan.rows;
        }
        else if (declared.length > 0) {
            // The declaration is VOID — one of its files cannot be read. The host
            // throws on a missing overlay file and skips the ENTIRE bundle, so no
            // part of this package can go live, now or after a restart.
            return {
                ok: false,
                reason: '声明的 patch 文件缺失或不可读,宿主会跳过整个 bundle,请修复或重装该包 / a declared patch file is unreadable; the host skips the whole bundle — fix or reinstall the package',
            };
        }
        else {
            // No host patch. Client-only packages (dsh.client, no dsh.bundle) never
            // get a loader entry — not even after a restart — so client-modules
            // would never serve their bundle. A shim entry under the package's name
            // is the whole activation.
            const dsh = readPkgDsh(profileDir, packageName);
            if (dsh === null || dsh.client === undefined || dsh.bundle !== undefined) {
                return {
                    ok: false,
                    reason: '该包无 bundle patch 且未声明 dsh.client,没有可热挂载的内容 / no bundle patch and no dsh.client surface — nothing to hot-mount',
                };
            }
            shimNames.add(packageName);
            rows = [{ id: `client-${packageName.replace(/[^A-Za-z0-9_.-]/g, '-')}`, name: packageName }];
        }
        const dir = join(profileDir, HOT_DIR);
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        hotSequence += 1;
        const file = join(dir, `hot-${String(hotSequence)}.yml`);
        // Keep the package identity on loader entries: the host's client-module
        // registry uses it to find package.json and the browser bundle. Only the
        // import resolves against this profile, so closure-hosted loaders still
        // receive an absolute module URL without making it the plugin's name.
        const yml = rows
            .map(row => `- id: '${yamlSingleQuoted(`mkt-${row.id}`)}'\n  name: '${yamlSingleQuoted(row.name)}'\n`)
            .join('');
        writeFileSync(file, yml);
        const mountLog = watchMountLog(ctx);
        let handle;
        try {
            handle = ctx.plugin(HotTree, { path: pathToFileURL(file).href });
        }
        catch (error) {
            // `ctx.plugin()` bails out before creating anything when the fiber is no
            // longer active (a mount issued during teardown) or the plugin is
            // rejected. The sink is already registered by then, so release it here:
            // the outer catch reports the failure, it does not clean this up.
            mountLog.stop();
            throw error;
        }
        try {
            await raceActivationTimeout(handle.await());
        }
        catch (error) {
            mountLog.stop();
            // A failed or wedged mount must leave NOTHING behind: the disposed
            // subtree stops retrying the import, and the input file is removed so
            // it cannot be re-imported by a later boot or replay (a leftover file
            // re-throwing the same resolve error on every composition replay
            // produced unbounded error-log growth on a closure-hosted loader).
            try {
                Promise.resolve(handle.dispose()).catch(() => { });
            }
            catch { /* best effort */ }
            try {
                rmSync(file, { force: true });
            }
            catch { /* best effort */ }
            hotTrees.delete(pathToFileURL(file).href);
            if (error instanceof ActivationTimeout) {
                // A wedged activation would otherwise hold this request open forever:
                // the route's `finally { installing = false }` never runs, so every
                // later install/update/uninstall gets 409'd until a host restart.
                // Unwind the half-mounted subtree best-effort; disposal never blocks
                // the reply, and the caller falls back to restart activation.
            }
            throw error;
        }
        hotHandles.set(packageName, handle);
        hotTreeOf.set(packageName, pathToFileURL(file).href);
        const failure = hotMountFailure(packageName, profileDir);
        const lines = mountLog.finish();
        if (failure === null) {
            ctx.logger?.info?.(`[dsh-market] hot-mounted ${packageName}`);
            logEvent('info', 'hot-mount', `${packageName}: live${shimNames.has(packageName) ? ' (client-only shim)' : ''}`);
        }
        else {
            ctx.logger?.warn(`[dsh-market] ${packageName}: ${failure}`);
            logEvent('warn', 'hot-mount', `${packageName}: ${failure}`);
        }
        // A mount that resolves while an entry is still waiting on a service is
        // "live" by the host's own verdict, so the verdict stands — but the lines
        // the host logged meanwhile are the only record of why the entry never
        // started serving (#1197).
        for (const line of lines) {
            logEvent('warn', 'hot-mount', `${packageName}: the host logged this while mounting — ${line}`);
        }
        return mountResult(failure);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn(`[dsh-market] hot mount of ${packageName} failed, restart required: ${message}`);
        logEvent('warn', 'hot-mount', `${packageName}: fell back to restart — ${message}`);
        return { ok: false, reason: `热挂载失败,重启后生效 — ${message} / hot-mount failed — restart required: ${message}` };
    }
}
/**
 * Mount every installed client-only package (`dsh.client` without
 * `dsh.bundle`) at market startup. The bundle reconcile skips these packages
 * entirely, so without the market's shim their client bundles are unreachable
 * in every boot — this is what makes them behave like normal plugins.
 * @returns names that were mounted.
 */
export async function mountClientOnlyDeps(ctx, profileDir,
/** The host's install directory; `undefined` finds it, `null` means "do not look". */
hostDirectory) {
    let deps;
    let bundles;
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
        bundles = manifest.dsh?.profile?.bundles ?? [];
        const bundleSet = new Set(bundles);
        deps = Object.keys(manifest.dependencies ?? {}).filter(name => !bundleSet.has(name));
    }
    catch {
        return [];
    }
    const disabled = readDisabled(profileDir);
    const userManaged = readUserPatchControls(profileDir);
    const hostProvided = bundleLayerTargets(profileDir, bundles, hostDirectory);
    const mounted = [];
    for (const name of deps) {
        if (isTeamComponent(name))
            continue;
        if (hotHandles.has(name) || disabled.has(name))
            continue;
        // Packages the USER's patch layer already manages (insert or disable
        // rows in cordis.patch.yml, e.g. via dsh-web-plugin-manager) are theirs
        // to control — a shim here would override a user's "disabled" choice on
        // every restart (#58 by @vikna919).
        if (patchLayerManages(userManaged, name))
            continue;
        // A package the profile's bundle layer ALREADY mounts needs no shim: the
        // entry is live, under a row id only the bundle decides. Sheathing a
        // second fiber over it registers its services again, cordis refuses the
        // duplicate, and the market recorded the shim as live while the host
        // reported the entry as not activated (#1137).
        if (hostProvided.has(name)) {
            logEvent('info', 'boot', `${name}: already mounted by the profile's bundle layer, no client-only shim (#1137)`);
            continue;
        }
        const dsh = readPkgDsh(profileDir, name);
        if (dsh === null || dsh.client === undefined || dsh.bundle !== undefined)
            continue;
        if ((await hotMount(ctx, profileDir, name)).ok)
            mounted.push(name);
    }
    return mounted;
}
/**
 * Package names the profile's OWN bundle layer already mounts.
 *
 * The shim predicate reads the profile manifest, so it can only see a package
 * as a dependency; it cannot see that an in-box bundle mounts the same package
 * under a row id of its own — `@deepseek-ai/dsh-web-app` ships
 * `- id: connection` / `name: '@deepseek-ai/dsh-client-connection'` (#1137).
 * Those packages also declare `dsh.client` and no `dsh.bundle`, so every
 * existing predicate says "shim it". Only the row NAMES link the two, and a
 * clean profile's bundles are the only place they are written down.
 *
 * A bundle whose declaration cannot be read contributes nothing, which keeps
 * today's behaviour (shim, possibly duplicated) rather than silently dropping
 * a client bundle that the bundle layer never mounts.
 */
export function bundleLayerTargets(profileDir, bundles, hostDirectory) {
    const targets = new Set();
    // Looked up lazily: a profile with no bundle the host provides never pays.
    let host = hostDirectory;
    for (const bundle of bundles) {
        if (host === undefined)
            host = findDshInstallDir();
        for (const name of bundlePatchTargets(bundleDirectory(profileDir, host, bundle)))
            targets.add(name);
    }
    return targets;
}
/**
 * Where the boot reads one bundle from (#1137).
 *
 * The official bundles — `@deepseek-ai/dsh-web-app` and its siblings — ship
 * inside the dsh installation, not in the profile: a plain `dsh web` profile's
 * `node_modules/@deepseek-ai/` holds only the few packages linked into it. The
 * boot (dsh-app-boot's resolveBundleDir) probes Node's search paths from the
 * installation first and the profile second, and so does this; looking only
 * in the profile made every in-box bundle read as empty, which is the one kind
 * of bundle whose rows mount other in-box packages.
 *
 * A host that cannot be read from here (null, or an archive plain Node cannot
 * open) leaves the profile path, which is what this always did.
 */
function bundleDirectory(profileDir, host, bundle) {
    if (host !== null) {
        try {
            for (const searchPath of createRequire(join(host, 'package.json')).resolve.paths(bundle) ?? []) {
                const candidate = join(searchPath, bundle);
                if (existsSync(join(candidate, 'package.json')))
                    return candidate;
            }
        }
        catch { /* an unreadable anchor says nothing: fall back to the profile */ }
    }
    return join(profileDir, 'node_modules', ...bundle.split('/'));
}
/**
 * Row ids and package names the user's own patch layer (cordis.patch.yml)
 * already contains. Line-wise scan on purpose: the file may hold structures
 * the market's strict patch parser rejects, but any mention of a row id or
 * package name is enough to know the user manages it (#58).
 */
export function readUserPatchControls(profileDir) {
    const ids = new Set();
    const names = new Set();
    try {
        const text = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const id = /^\s*-?\s*id:\s*['"]?([A-Za-z0-9._/@-]+)/.exec(line);
            if (id !== null)
                ids.add(id[1]);
            const name = /^\s*name:\s*['"]?([^'"\s]+)/.exec(line);
            if (name !== null)
                names.add(name[1]);
        }
    }
    catch { /* no user patch file — nothing is user-managed */ }
    return { ids, names };
}
/**
 * Whether the user patch layer manages `name` — matched by exact package
 * name or by the plugin-manager row-id convention (strip the leading @,
 * non-alphanumerics to '-', lowercase).
 */
export function patchLayerManages(controls, name) {
    const rowId = name.replace(/^@/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    return controls.ids.has(rowId) || controls.names.has(name);
}
/**
 * Delete the market's own state directory.
 *
 * `cleanHotDir` wipes the ephemeral hot-mount inputs on every boot but
 * deliberately preserves `state.json` — the disable list and custom groups
 * are the user's durable choices. Uninstalling the market is the one moment
 * where removing them is the right thing, and only when the user asked.
 * @returns true when a directory was there to remove.
 */
export function purgeMarketState(profileDir) {
    const dir = join(profileDir, HOT_DIR);
    try {
        rmSync(dir, { recursive: true, force: true });
        return true;
    }
    catch {
        return false;
    }
}
