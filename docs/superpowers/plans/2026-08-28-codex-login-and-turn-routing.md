# Codex Login and One-Shot Turn Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the packaged ChatGPT/Codex login report the actual Codex model and let a user route exactly one main-conversation turn through `subagent_codex`.

**Architecture:** Keep DSH as the only parent conversation runtime. The Electron main process probes the bundled Codex app-server inside the Agent Pi-specific `CODEX_HOME` and returns normalized model metadata through the existing auth status bridge. The tender web composer owns one explicit transaction controller per session. Its `idle → armed → preparing → submitting → idle/armed/disposed` transitions validate the public DSH session and input stores, prepare attachments without mutating user work, and reset the one-shot intent only after the host publishes the matching submitted user message.

**Tech Stack:** Electron 43, Node.js ESM/CommonJS preload bridge, Codex CLI/app-server JSON-RPC, hand-authored React client bundle, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-28-codex-context-compaction-design.md`

## Global Constraints

- Product version remains exactly `3.3.5`.
- Codex is an isolated `subagent_codex`, not a DSH model provider and not an embedded Windows Codex Desktop window.
- ChatGPT login uses the system browser and the application-specific `CODEX_HOME`; no API key or token crosses into the renderer.
- The “Codex 执行” control applies to one successfully submitted message and resets only after the host confirms that submitted message.
- If Codex is unavailable or logged out, preserve the draft and attachments and do not silently execute with DSH.
- Preserve unrelated root and `vendor/deepseek-harness` working-tree changes.

---

### Task 1: Commit the already-verified packaged preload repair baseline

**Files:**
- Modify: `apps/desktop/main.mjs:408`
- Modify: `apps/desktop/package.json:28-39`
- Delete: `apps/desktop/preload.mjs`
- Create: `apps/desktop/preload.cjs`
- Modify: `apps/desktop/tests/codex-auth.test.mjs:67-113`
- Modify: `scripts/pack-runtime-payload.mjs:34-45`
- Modify: `scripts/stamp-electron-asar-version.mjs`

**Interfaces:**
- Consumes: Electron `contextBridge`, `ipcRenderer`, and `webUtils` from CommonJS `require('electron')`.
- Produces: `window.agentPiDesktop.codexAuthStatus()`, `codexAuthLogin()`, and `codexAuthLogout()` from a sandbox-compatible preload.

- [ ] **Step 1: Re-run the focused preload tests before staging**

```powershell
node --test apps/desktop/tests/codex-auth.test.mjs
```

Expected: four tests pass, including “sandboxed Electron preload executes as CommonJS”.

- [ ] **Step 2: Verify the packaged file lists use only `preload.cjs`**

```powershell
rg -n "preload\.(cjs|mjs)" apps/desktop/main.mjs apps/desktop/package.json scripts/pack-runtime-payload.mjs scripts/stamp-electron-asar-version.mjs
```

Expected: runtime and package references point to `preload.cjs`.

- [ ] **Step 3: Stage only the preload repair files and inspect the staged diff**

```powershell
git add -- apps/desktop/main.mjs apps/desktop/package.json apps/desktop/preload.cjs apps/desktop/preload.mjs apps/desktop/tests/codex-auth.test.mjs scripts/pack-runtime-payload.mjs scripts/stamp-electron-asar-version.mjs
git diff --cached --check
git diff --cached --name-status
```

Expected: no `vendor/deepseek-harness` entry and no unrelated product file is staged.

- [ ] **Step 4: Commit the baseline**

```powershell
git commit -m "fix(desktop): load Codex bridge from sandboxed preload"
```

### Task 2: Parse and probe the actual Codex app-server model

**Files:**
- Create: `apps/desktop/codex-models.mjs`
- Create: `apps/desktop/tests/codex-models.test.mjs`
- Modify: `apps/desktop/package.json:28-39`
- Modify: `scripts/pack-runtime-payload.mjs:34-45`

**Interfaces:**
- Consumes: app-server JSON-lines output from `codex app-server --stdio`.
- Produces: `codexModelFromAppServerOutput(stdout: string): CodexModelStatus | null` and `probeCodexModel(options): CodexModelStatus | null`.
- `CodexModelStatus` is `{ id: string, contextWindow: number, maxTokens: number, contextWindowSource: 'provider' | 'official' | 'estimated', maxTokensSource: 'provider' | 'official' | 'estimated' }`.
- Resolve each field independently: app-server metadata > exact official catalog > conservative estimate.

- [ ] **Step 1: Write failing parser tests for known, unknown, and missing defaults**

```js
test('selects the app-server default and applies exact official capacity', () => {
  const output = [
    JSON.stringify({ id: 1, result: {} }),
    JSON.stringify({ id: 2, result: { data: [
      { id: 'gpt-5.6-sol', isDefault: true },
      { id: 'gpt-5.6-terra', isDefault: false },
    ] } }),
  ].join('\n')
  assert.deepEqual(codexModelFromAppServerOutput(output), {
    id: 'gpt-5.6-sol',
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    contextWindowSource: 'official',
    maxTokensSource: 'official',
  })
})

test('labels an unknown default with conservative estimates', () => {
  const output = JSON.stringify({
    id: 2,
    result: { data: [{ id: 'future-codex', isDefault: true }] },
  })
  assert.deepEqual(codexModelFromAppServerOutput(output), {
    id: 'future-codex',
    contextWindow: 262_144,
    maxTokens: 32_768,
    contextWindowSource: 'estimated',
    maxTokensSource: 'estimated',
  })
})

test('prefers app-server capacity per field', () => {
  const output = JSON.stringify({
    id: 2,
    result: { data: [{
      id: 'gpt-5.6-sol',
      isDefault: true,
      contextWindow: 900_000,
    }] },
  })
  assert.deepEqual(codexModelFromAppServerOutput(output), {
    id: 'gpt-5.6-sol',
    contextWindow: 900_000,
    maxTokens: 128_000,
    contextWindowSource: 'provider',
    maxTokensSource: 'official',
  })
})

test('returns null when model/list has no usable default', () => {
  assert.equal(codexModelFromAppServerOutput('{"id":2,"result":{"data":[]}}'), null)
})
```

- [ ] **Step 2: Run the test to verify the module is missing**

```powershell
node --test apps/desktop/tests/codex-models.test.mjs
```

Expected: FAIL because `../codex-models.mjs` does not exist.

- [ ] **Step 3: Implement the exact capacity catalog and JSON-lines parser**

```js
const ESTIMATED_CAPACITY = Object.freeze({
  contextWindow: 262_144,
  maxTokens: 32_768,
})
const OFFICIAL_CAPACITY = new Map([
  ['gpt-5.6-sol', Object.freeze({
    contextWindow: 1_050_000,
    maxTokens: 128_000,
  })],
])

export function codexModelFromAppServerOutput(stdout) {
  const messages = String(stdout || '').split(/\r?\n/).flatMap((line) => {
    try { return line.trim() ? [JSON.parse(line)] : [] } catch { return [] }
  })
  const reply = messages.find((message) => message?.id === 2)
  const models = Array.isArray(reply?.result?.data) ? reply.result.data : []
  const selected = models.find(
    (model) => model?.isDefault === true && typeof model?.id === 'string',
  )
  if (!selected) return null
  const official = OFFICIAL_CAPACITY.get(selected.id)
  return {
    id: selected.id,
    contextWindow: selected.contextWindow
      ?? official?.contextWindow
      ?? ESTIMATED_CAPACITY.contextWindow,
    maxTokens: selected.maxTokens
      ?? official?.maxTokens
      ?? ESTIMATED_CAPACITY.maxTokens,
    contextWindowSource: selected.contextWindow
      ? 'provider'
      : official ? 'official' : 'estimated',
    maxTokensSource: selected.maxTokens
      ? 'provider'
      : official ? 'official' : 'estimated',
  }
}
```

Normalize only documented positive numeric capacity fields returned by the app-server. Reject zero, negative, non-finite, or string values and continue to the next source.

Implement `probeCodexModel` with:

```js
spawnSync(nodePath, [wrapperPath, 'app-server', '--stdio'], {
  input,
  cwd: codexHome,
  env,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 10_000,
})
```

The input contains `initialize` with id `1`, an `initialized` notification, and `model/list` with id `2`, each terminated by `\n`. Return `null` on spawn failure, timeout, non-zero exit, or an unparsable reply.

- [ ] **Step 4: Test the exact spawned command without starting a real app-server**

```js
assert.deepEqual(call.args, ['codex.js', 'app-server', '--stdio'])
assert.equal(call.options.env.CODEX_HOME, codexHome)
assert.match(call.options.input, /"method":"model\/list"/)
assert.equal(call.options.timeout, 10_000)
```

- [ ] **Step 5: Include the new module in both packaging manifests**

Add `codex-models.mjs` to `apps/desktop/package.json` `build.files` and the desktop whitelist in `scripts/pack-runtime-payload.mjs`.

- [ ] **Step 6: Run focused tests and commit**

```powershell
node --test apps/desktop/tests/codex-models.test.mjs apps/desktop/tests/codex-auth.test.mjs
git add -- apps/desktop/codex-models.mjs apps/desktop/tests/codex-models.test.mjs apps/desktop/package.json scripts/pack-runtime-payload.mjs
git diff --cached --check
git commit -m "feat(desktop): report active Codex model capacity"
```

### Task 3: Attach model metadata to normalized Codex auth status

**Files:**
- Modify: `apps/desktop/codex-auth.mjs:1-113`
- Modify: `apps/desktop/tests/codex-auth.test.mjs:1-113`
- Modify: `bundles/tender-web/lib/client.js:9576-9680`
- Modify: `bundles/tender-web/tests/codex-settings.test.ts:1-20`

**Interfaces:**
- Consumes: `probeCodexModel()` from Task 2.
- Produces: logged-in auth status with optional `model: CodexModelStatus`; all other auth states remain unchanged.

- [ ] **Step 1: Write a failing controller test for logged-in enrichment**

Use command-sensitive fake process behavior:

```js
spawnSync(_command, args) {
  if (args.slice(-2).join(' ') === 'login status') {
    return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '' }
  }
  if (args.includes('app-server')) {
    return { status: 0, stdout: appServerReply, stderr: '' }
  }
  throw new Error('unexpected command')
}
```

Assert `controller.status()` includes the `gpt-5.6-sol` model object from Task 2.

- [ ] **Step 2: Run the test and verify metadata is absent**

```powershell
node --test apps/desktop/tests/codex-auth.test.mjs
```

Expected: FAIL on the model assertion.

- [ ] **Step 3: Enrich only the logged-in status**

```js
const parsed = parseCodexLoginStatus(loginStatusResult)
if (parsed.state !== 'logged-in') return parsed
const model = probeCodexModel({
  spawnSync,
  nodePath: options.nodePath,
  wrapperPath: options.wrapperPath,
  codexHome: options.codexHome,
  env,
})
return model === null ? parsed : { ...parsed, model }
```

Do not return raw app-server output, credentials, paths, or environment variables.

- [ ] **Step 4: Render model capacity in the Codex settings section**

When `auth.model` exists, render model id, formatted context, formatted output cap, and each field's `供应商返回`/`官方参数`/`估算参数` provenance. When it is absent, keep login usable and show `模型信息暂不可用` instead of changing the auth state to unavailable.

- [ ] **Step 5: Update assertions, test, and commit**

```powershell
node --test apps/desktop/tests/codex-auth.test.mjs apps/desktop/tests/codex-models.test.mjs
node --test bundles/tender-web/tests/codex-settings.test.ts
git add -- apps/desktop/codex-auth.mjs apps/desktop/tests/codex-auth.test.mjs bundles/tender-web/lib/client.js bundles/tender-web/tests/codex-settings.test.ts
git diff --cached --check
git commit -m "feat(codex): show logged-in model and context capacity"
```

### Task 4: Define the deterministic one-shot delegation text

**Files:**
- Create: `bundles/tender-web/src/codex-turn.ts`
- Create: `bundles/tender-web/tests/codex-turn.test.ts`

**Interfaces:**
- Produces: `buildCodexTurnDelegation(task: string): string` and `codexCanRun(status: unknown): boolean`.
- The browser bundle mirrors this tested pure function because `lib/client.js` is the shipped hand-authored artifact.

- [ ] **Step 1: Write failing pure-function tests**

```ts
test('builds a foreground one-shot delegation without changing the task', () => {
  const task = '修复 C:\\work\\app.ts，并运行测试。'
  const prompt = buildCodexTurnDelegation(task)
  assert.match(prompt, /subagent_codex/)
  assert.match(prompt, /run_in_background=false/)
  assert.match(prompt, /等待 Codex 完成/)
  assert.match(prompt, /核验实际结果/)
  assert.ok(prompt.endsWith(task))
})

test('requires an available logged-in runtime', () => {
  assert.equal(codexCanRun({ available: true, state: 'logged-in' }), true)
  assert.equal(codexCanRun({ available: true, state: 'logged-out' }), false)
  assert.equal(codexCanRun({ available: false, state: 'unavailable' }), false)
})
```

- [ ] **Step 2: Run the test to verify the module is missing**

```powershell
node --test bundles/tender-web/tests/codex-turn.test.ts
```

Expected: FAIL because `../src/codex-turn.ts` does not exist.

- [ ] **Step 3: Implement the minimal helper**

```ts
export function buildCodexTurnDelegation(task: string): string {
  const original = String(task || '').trim()
  if (!original) throw new Error('Codex delegation requires a non-empty task')
  return `【Codex 执行模式】
你是 DSH 主智能体。必须立即调用 subagent_codex，将 run_in_background=false；不要先自行完成任务。请把下方用户任务、明确文件路径、必要上下文和验收目标整理成独立委派，等待 Codex 完成，核验实际结果后再向用户汇报。

【用户原始任务】
${original}`
}

export function codexCanRun(status: unknown): boolean {
  const value = status as { available?: unknown; state?: unknown } | null
  return value?.available === true && value.state === 'logged-in'
}
```

- [ ] **Step 4: Test and commit**

```powershell
node --test bundles/tender-web/tests/codex-turn.test.ts
git add -- bundles/tender-web/src/codex-turn.ts bundles/tender-web/tests/codex-turn.test.ts
git diff --cached --check
git commit -m "test(codex): define one-shot delegation contract"
```

### Task 5: Replace the one-shot wiring with a per-session transaction controller

**Files:**
- Modify: `bundles/tender-web/lib/client.js`
- Modify: `bundles/tender-web/tests/codex-turn.test.ts`
- Preserve: `bundles/tender-web/tests/codex-settings.test.ts`

**Interfaces:**
- Consumes: `window.agentPiDesktop.codexAuthStatus()`, Task 4’s exact delegation framing, `runtime.sessions.scope(sessionId)`, `runtime.conversation.input.for(scope).state`, and the public session snapshot.
- Produces: one controller per session with explicit `idle`, `armed`, `preparing`, `submitting`, and `disposed` phases; the compact `Codex 执行` button reflects the controller phase.
- The controller is the only owner of armed intent, active attempt token, captured draft/attachment instances, settlement subscriptions, and terminal cleanup.

- [ ] **Step 1: Add failing behavioral tests for the two remaining review findings**

Exercise the actual shipped composer through the existing VM harness with queued animation frames:

1. A resident session whose public snapshot has `removed: true` is rejected before draft mutation and before the original submit.
2. Input phases `submitting` and `adjudicating` are rejected before draft mutation and before the original submit; the controller remains armed and retryable when the input returns to `plain`.

Each test must first fail for the reviewed behavior, not because of a harness error.

- [ ] **Step 2: Replace scattered state with one explicit controller per session**

Use a session-keyed controller map outside React mount lifetime. Each controller owns:

```text
phase: idle | armed | preparing | submitting | disposed
latestProps
attemptToken
originalDraft
framedDraft
capturedAttachmentIds
preSubmitUserNodeWatermark
unsubscribeSession
unsubscribeInput
```

Required transitions:

| From | Event | To | Required effect |
| --- | --- | --- | --- |
| `idle` | user arms | `armed` | notify button listeners |
| `armed` | submit starts | `preparing` | snapshot draft and session-local attachment instance IDs |
| `preparing` | auth/preparation/preflight fails | `armed` | preserve latest draft, images, and attachments; release attempt resources |
| `preparing` | strict preflight passes | `submitting` | write framed draft once, register public-store settlement observers, invoke original submit |
| `submitting` | matching new user node | `idle` | clear one-shot intent and only captured attachment instances |
| `submitting` | send error | `armed` | restore only a still-owned framed draft; preserve newer user work |
| any live phase | session snapshot becomes removed or scope is disposed | `disposed` | unsubscribe, release locks, delete controller from the map |

No standalone `armed`, `submitting`, or `pending` sets may remain after the replacement.

- [ ] **Step 3: Make asynchronous preparation non-mutating**

Replace the Codex branch’s mutating attachment fold with a preparation function that returns the final folded text and captured session-local attachment IDs without changing the live draft or attachment collections while document reads are pending.

After every await, reacquire the controller’s `latestProps` and public stores. Before writing the framed draft require all of the following in the same synchronous turn:

- the controller and attempt token are still current and phase is `preparing`;
- the session snapshot exists and `removed !== true`;
- the input snapshot exists and `phase === 'plain'`;
- the live draft still equals the captured original draft;
- the session-local attachment instance-ID sequence still equals the captured sequence.

If any check fails, return to `armed` without modifying user work or invoking the original submit.

- [ ] **Step 4: Make settlement terminal, session-safe, and success-based**

Immediately before the original submit, require usable `getSnapshot` and `subscribe` functions from both public stores. Register both subscriptions inside the same guarded synchronous callback and invoke the original submit inside that guard.

- Success is only a new post-watermark user node whose exact text equals the framed delegation.
- Only `promptError.op === 'send'` is a send failure; `op === 'stop'` is unrelated.
- Setup/original-submit exceptions return the controller to `armed`, dispose partial subscriptions, and conditionally restore only a still-owned framed draft.
- A removed/disposed session disposes the controller instead of retrying a nonexistent conversation.
- Confirmed success removes only the captured attachment IDs from that session’s own map and never overwrites another active session’s attachment list.
- Every terminal path disposes subscriptions exactly once. No timer or React-mounted effect may be required for correctness.

- [ ] **Step 5: Preserve the compact one-shot UI and ordinary submit path**

The existing `Codex 执行` button, accessibility state, exact unavailable message, and exact Task 4 delegation text remain. `preparing` and `submitting` prevent duplicate Codex submits. When the controller is not armed, the original composer submit behavior remains unchanged.

- [ ] **Step 6: Run focused and full tests**

```powershell
node --test bundles/tender-web/tests/codex-turn.test.ts bundles/tender-web/tests/codex-settings.test.ts
node --test (Get-ChildItem bundles/tender-web/tests -Filter *.test.ts).FullName
```

Expected: all prior Task 5 behavioral tests plus the removed-session and busy-input tests pass; attachment, selection rewrite, and session wake tests remain green.

- [ ] **Step 7: Commit the transaction-controller replacement**

```powershell
git add -- bundles/tender-web/lib/client.js bundles/tender-web/tests/codex-turn.test.ts
git diff --cached --check
git commit -m "refactor(codex): use per-session turn transactions"
```

### Task 6: Verify the unpacked installed path without publishing

**Files:**
- Modify if required by Windows verification: `scripts/apply-dsh-patches.mjs`
- Modify if required by Windows verification: `scripts/apply-dsh-patches.test.mjs`
- Otherwise verify only.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: local evidence that the CommonJS bridge, model probe, and one-shot routing coexist.

- [ ] **Step 1: Run all desktop and tender web tests**

```powershell
node --test apps/desktop/tests/*.test.mjs
node --test (Get-ChildItem bundles/tender-web/tests -Filter *.test.ts).FullName
```

- [ ] **Step 2: Rebuild the unpacked Windows application**

Before packaging, `node --test scripts/apply-dsh-patches.test.mjs` must pass. On Windows CRLF checkouts, a fully applied root DSH patch must be recognized as `already-applied`; forward/reverse checks and application must tolerate whitespace-only context differences while retaining all existing pinned-base and mismatch safeguards.

If this verification exposes the CRLF idempotence defect, add the failing CRLF regression first, implement the minimal applicator fix, and commit only those two script files:

```powershell
node --test scripts/apply-dsh-patches.test.mjs
git add -- scripts/apply-dsh-patches.mjs scripts/apply-dsh-patches.test.mjs
git diff --cached --check
git commit -m "fix(pack): recognize CRLF-applied DSH patches"
```

Then run the packaging command:

```powershell
powershell -File scripts/pack-win.ps1 -DirOnly
```

Expected: `apps/desktop/dist-unpacked/win-unpacked/agent-pi-DSH.exe` exists and packaged resources contain `preload.cjs`, `codex-auth.mjs`, and `codex-models.mjs`.

- [ ] **Step 3: Perform the runtime smoke**

Confirm in the unpacked application:

- 设置 → Codex 智能体 shows the logged-in model or the non-blocking `模型信息暂不可用` state.
- The main composer shows `Codex 执行`.
- Logged-out send preserves the draft.
- Logged-in send creates one foreground `subagent_codex` task and resets the control.
