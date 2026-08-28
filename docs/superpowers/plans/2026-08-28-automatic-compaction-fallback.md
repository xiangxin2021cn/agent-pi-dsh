# Automatic Compaction and DeepSeek Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger compaction at 72% context usage and, only after an eligible primary summarization failure, atomically retry with `deepseek-v4-flash-vision-exp` while preserving cancellation, privacy, and session history guarantees.

**Architecture:** Add one ordered global fallback list to `compaction-basic`; the existing summarizer remains responsible for a single LLM request, while the engine owns retry target selection and error classification. Agent Pi's managed profile enables one DeepSeek fallback by default, and an Electron preference lets the user disable cross-provider fallback without changing the current-model-first behavior.

**Tech Stack:** DSH TypeScript plugin, Zod configuration, Cordis event store, Electron IPC/preload, hand-authored React settings client, Node/Vitest tests, root managed-profile initializer and vendor patch.

**Spec:** `docs/superpowers/specs/2026-08-28-codex-context-compaction-design.md`

## Global Constraints

- Product version remains exactly `3.3.5`.
- Compaction always tries the configured/current session model first.
- The only default fallback is provider `deepseek-official`, model `deepseek-v4-flash-vision-exp`, `maxTokens: 32_768`.
- Fallback is allowed only after the primary adapter's own retries are exhausted.
- Cancellation, shutdown, policy/safety/content-filter rejection, and missing DeepSeek credentials must not send history to another provider.
- A failed primary and failed/unavailable fallback must leave the original conversation surface intact.
- Do not create partial summary/replacement events.
- Preserve unrelated root and vendored changes.

---

### Task 1: Extend `compaction-basic` configuration with an ordered fallback list

**Files:**
- Modify: `vendor/deepseek-harness/packages/compaction/compaction-basic/src/types.ts`
- Modify: `vendor/deepseek-harness/packages/compaction/compaction-basic/src/config.ts`
- Create: `vendor/deepseek-harness/packages/compaction/compaction-basic/tests/config.spec.ts`

**Interfaces:**
- Add:

```ts
export interface SummarizationFallbackConfig {
  provider: string;
  model: string;
  maxTokens?: number;
}

export interface ResolvedSummarizationFallback {
  provider: string;
  model: string;
  maxTokens: number;
}
```

- Add optional `summarizationFallbacks?: SummarizationFallbackConfig[]` to `CompactionPolicyConfig`.
- Carry a frozen `summarizationFallbacks: readonly ResolvedSummarizationFallback[]` through the resolved/target policy.
- Each fallback's `maxTokens` defaults to the existing configured summarization max, not to the model's full output limit.

- [ ] **Step 1: Add failing schema and resolution tests**

Cover an omitted list, one valid fallback, ordered multiple entries, defaulted `maxTokens`, invalid empty provider/model, invalid non-positive tokens, and unknown configuration keys.

- [ ] **Step 2: Run the focused config tests and verify failure**

```powershell
Set-Location vendor/deepseek-harness
pnpm exec vitest run packages/compaction/compaction-basic/tests/config.spec.ts
```

Expected: the schema rejects or ignores the new property and resolved policies lack the fallback list.

- [ ] **Step 3: Add the minimal schema/types/resolution logic**

Clone and freeze the resolved entries to prevent policy mutation during a running compaction. Do not add per-model fallback rules.

- [ ] **Step 4: Re-run the focused config tests**

```powershell
pnpm exec vitest run packages/compaction/compaction-basic/tests/config.spec.ts
```

Expected: all selected configuration tests pass.

### Task 2: Classify failures that may cross the provider boundary

**Files:**
- Create: `vendor/deepseek-harness/packages/compaction/compaction-basic/src/fallback.ts`
- Create: `vendor/deepseek-harness/packages/compaction/compaction-basic/tests/fallback.spec.ts`

**Interfaces:**
- Export `shouldTrySummarizationFallback(error: unknown, signal?: AbortSignal): boolean`.
- Return `false` when:
  - `signal.aborted` is true;
  - error code is `ABORTED`, `CANCELLED`, `SHUTDOWN`, `POLICY`, `SAFETY`, or `CONTENT_FILTER`;
- Return `true` for primary failures classified as `CONTEXT_WINDOW_EXCEEDED`, `MAX_TOKENS`, `UNSUPPORTED_CONTENT`, `MODEL_UNAVAILABLE`, authentication/unavailability, or exhausted transient/provider failure.
- Unknown primary execution errors may fall back only when they are not cancellation, shutdown, policy, safety, or content-filter errors.
- Missing DeepSeek credentials are handled when resolving the fallback target; they produce `fallback unavailable` without an LLM request and without another fallback.

- [ ] **Step 1: Write the classification table as failing parameterized tests**

Include uppercase/lowercase error-code normalization, `AbortError`, an already-aborted signal, policy text without a code, a primary authentication error, a generic network failure, and a normal `Error`.

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
pnpm exec vitest run packages/compaction/compaction-basic/tests/fallback.spec.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement a conservative deny-first classifier**

Read code/name/message without mutating the error. Check cancellation/shutdown/policy/safety denials before checking eligible codes. Treat primary authentication failure as model unavailability; the later fallback-target resolution remains responsible for checking DeepSeek credentials. Do not include message contents in telemetry.

- [ ] **Step 4: Re-run the classifier test**

```powershell
pnpm exec vitest run packages/compaction/compaction-basic/tests/fallback.spec.ts
```

Expected: all classification cases pass.

### Task 3: Execute primary then fallback summarization without partial commits

**Files:**
- Modify: `vendor/deepseek-harness/packages/compaction/compaction-basic/src/summarizer.ts`
- Modify: `vendor/deepseek-harness/packages/compaction/compaction-basic/src/index.ts`
- Modify: `vendor/deepseek-harness/packages/compaction/compaction-basic/tests/compaction-basic.spec.ts`

**Interfaces:**
- Extend the internal `summarizeWithLlm()` call with an optional explicit target `{provider, model, maxTokens}`.
- The engine records an in-memory attempt list containing target role (`primary` or `fallback`), provider, model, and normalized outcome code.
- Only the successful result is passed to the existing region transaction and emitted as `compaction/summary`.
- The successful summary event already identifies its provider/model; preserve that behavior.

- [ ] **Step 1: Add failing primary-success and eligible-fallback tests**

Use the existing fake LLM harness to assert:

1. 71.9% usage does not compact and 72% usage does compact;
2. primary success makes exactly one request;
3. `CONTEXT_WINDOW_EXCEEDED` invokes the configured fallback;
4. `MAX_TOKENS` invokes the fallback;
5. `UNSUPPORTED_CONTENT` invokes the vision fallback and preserves image input for that request;
6. exhausted generic provider failure invokes the fallback;
7. fallback request receives `maxTokens: 32_768`;
8. manual `compactNow` uses the same primary-then-fallback chain;
9. exactly one final summary/replacement is committed.

- [ ] **Step 2: Add failing prohibited-fallback and atomicity tests**

Assert:

1. aborted signal makes no fallback request;
2. `POLICY`/`CONTENT_FILTER` makes no fallback request;
3. absent fallback credentials returns an actionable failure and preserves history;
4. primary and fallback both failing produces no summary/replacement event;
5. the failed `compaction/end` diagnostic identifies primary failure versus fallback unavailable/failure without message contents;
6. the original visible message set is byte-for-byte unchanged after failure.

- [ ] **Step 3: Run the focused engine tests and verify failure**

```powershell
pnpm exec vitest run packages/compaction/compaction-basic/tests/compaction-basic.spec.ts
```

Expected: fallback assertions fail because only one summarizer target exists.

- [ ] **Step 4: Add target override support to the single-request summarizer**

Preserve the current target resolution for the primary call. An explicit fallback target bypasses current-session selection but still uses the same signal and content serialization.

- [ ] **Step 5: Add the minimal ordered attempt loop in the engine**

Pseudocode:

```ts
try {
  return await summarizePrimary();
} catch (primaryError) {
  if (!shouldTrySummarizationFallback(primaryError, signal)) throw primaryError;
  for (const fallback of policy.summarizationFallbacks) {
    try {
      return await summarizeWithLlm(input, { target: fallback });
    } catch (fallbackError) {
      if (!shouldContinueFallbackChain(fallbackError, signal)) throw fallbackError;
      lastError = fallbackError;
    }
  }
  throw createCompactionFailure(primaryError, lastError);
}
```

With the Agent Pi default there is one fallback. Do not append summary/replacement events until this function returns a complete result.

- [ ] **Step 6: Produce actionable failure categories without secrets**

Distinguish primary failure, fallback unavailable, and fallback failure. Include provider/model IDs, never credentials, request bodies, or old message contents.

- [ ] **Step 7: Re-run the focused engine tests**

```powershell
pnpm exec vitest run packages/compaction/compaction-basic/tests/fallback.spec.ts packages/compaction/compaction-basic/tests/compaction-basic.spec.ts
```

Expected: all primary, fallback, cancellation, policy, and atomicity tests pass.

### Task 4: Configure 72% automatic compaction and the Agent Pi fallback

**Files:**
- Modify: `scripts/init-tender-profile.mjs`
- Create: `scripts/compaction-profile.test.mjs`

**Interfaces:**
- Managed plugin entry:

```yaml
- id: compaction-basic
  config:
    thresholdRatio: 0.72
    summarizationFallbacks:
      - provider: deepseek-official
        model: deepseek-v4-flash-vision-exp
        maxTokens: 32768
```

- Environment `AGENT_PI_COMPACTION_FALLBACK=0` omits only `summarizationFallbacks`; automatic compaction at 0.72 remains enabled.
- Missing environment value defaults fallback to enabled for Agent Pi 3.3.5.

- [ ] **Step 1: Add failing managed-profile tests**

Run the initializer against isolated temporary profiles and assert:

1. default profile has threshold 0.72 and exactly one fallback;
2. environment value `0` keeps threshold 0.72 and omits fallback;
3. repeated initialization does not duplicate the plugin or fallback;
4. unrelated user provider/model entries remain unchanged.

- [ ] **Step 2: Run the profile tests and verify failure**

```powershell
node --test scripts/compaction-profile.test.mjs
```

Expected: current initializer lacks the 72% and fallback configuration.

- [ ] **Step 3: Update only the managed compaction patch builder**

Keep the provider/model IDs literal and max tokens 32,768. Do not set the fallback as the primary summarization target.

- [ ] **Step 4: Re-run the profile tests**

```powershell
node --test scripts/compaction-profile.test.mjs
```

Expected: all initialization, disable, and idempotence cases pass.

### Task 5: Add the user-visible cross-provider fallback preference

**Files:**
- Create: `apps/desktop/compaction-preferences.mjs`
- Create: `apps/desktop/tests/compaction-preferences.test.mjs`
- Modify: `apps/desktop/main.mjs`
- Modify: `apps/desktop/preload.cjs`
- Modify: `apps/desktop/package.json`
- Modify: `scripts/pack-runtime-payload.mjs`

**Interfaces:**
- Export pure helpers that normalize missing preference to `{enabled: true}` and serialize an explicit boolean.
- Add bridge methods:
  - `compactionFallbackStatus(): Promise<{enabled: boolean}>`
  - `setCompactionFallback(enabled: boolean): Promise<{enabled: boolean; restartRequired: true}>`
- `runtimeEnv()` sets `AGENT_PI_COMPACTION_FALLBACK` to `"1"` or `"0"` from the persisted preference.
- Do not expose the full preferences file to the renderer.

- [ ] **Step 1: Write failing preference tests**

Cover default enabled, explicit disabled, invalid persisted values falling back to enabled, boolean-only setter validation, and `runtimeEnv` mapping.

- [ ] **Step 2: Run the focused tests and verify failure**

```powershell
node --test apps/desktop/tests/compaction-preferences.test.mjs
```

Expected: module or bridge behavior is absent.

- [ ] **Step 3: Implement the pure preference helper and main-process IPC**

Use the existing `window-prefs.json` read/write functions. Store only `compactionFallbackEnabled`; preserve every unrelated preference key.

- [ ] **Step 4: Expose the two narrow preload methods and include the helper in packaging lists**

Keep the CommonJS sandbox preload; do not expose `ipcRenderer`.

- [ ] **Step 5: Re-run desktop preference and preload tests**

```powershell
node --test apps/desktop/tests/compaction-preferences.test.mjs apps/desktop/tests/codex-auth.test.mjs
```

Expected: all selected desktop tests pass.

### Task 6: Show the 72% policy, cost/privacy notice, and toggle in settings

**Files:**
- Modify: `bundles/tender-web/lib/client.js:9576-9790`
- Create: `bundles/tender-web/tests/compaction-settings.test.ts`

**Interfaces:**
- The Codex/agent settings page contains a separate card titled `对话自动压缩`.
- The card states:
  - automatic compaction starts near 72%;
  - current model is tried first;
  - when enabled and eligible, old history may be sent to `deepseek-v4-flash-vision-exp`;
  - this can create a DeepSeek charge and crosses provider boundaries.
- Toggle state is loaded and saved through the desktop bridge.
- Saving shows `重启应用后生效`; bridge absence leaves the control disabled with a packaged-desktop-only explanation.

- [ ] **Step 1: Add failing source/behavior contract tests**

Assert the exact bridge method names, 72% text, model ID, charge/cross-provider notice, disabled bridge fallback, and restart-required state.

- [ ] **Step 2: Run the focused web test and verify failure**

```powershell
node --test bundles/tender-web/tests/compaction-settings.test.ts
```

Expected: settings card and bridge calls are absent.

- [ ] **Step 3: Add the smallest settings card and reuse the existing switch styles**

Do not add a new settings route or general preference framework. Keep existing Codex login UI behavior unchanged.

- [ ] **Step 4: Add only missing embedded CSS for status/help text**

Keep the CSS in the existing style block inside `lib/client.js`; reuse `.ap-switch` and existing card spacing wherever possible.

- [ ] **Step 5: Re-run focused settings tests**

```powershell
node --test bundles/tender-web/tests/compaction-settings.test.ts bundles/tender-web/tests/codex-settings.test.ts
```

Expected: new compaction tests and existing Codex settings tests pass.

### Task 7: Add a keyless end-to-end compaction fallback snapshot and documentation

**Files:**
- Modify: `vendor/deepseek-harness/examples/headless-agent/compaction.cordis.snapshot.yml`
- Modify: `vendor/deepseek-harness/examples/headless-agent/tests/headless.snapshot.ts:357-430`
- Modify: `vendor/deepseek-harness/examples/headless-agent/tests/snapshots/compaction-recovery/*`
- Modify: `vendor/deepseek-harness/packages/compaction/compaction-basic/README.md`
- Create: `vendor/deepseek-harness/.agents/notes/implemented/2026-08-28-compaction-fallback.md`

**Interfaces:**
- The replay fixture makes the primary summary target fail with an eligible capacity error and the DeepSeek fallback route return a deterministic complete summary.
- Snapshot asserts the successful summary's provider/model and the single committed replacement.
- No real API credential or network access is required.

- [ ] **Step 1: Change the replay fixture and expected snapshot before engine implementation verification**

The fixture must prove routing, not merely source-code presence.

- [ ] **Step 2: Run the focused keyless snapshot**

Use the exact headless snapshot command declared by the nested repository's package scripts and filter to compaction recovery.

Expected: snapshot passes with one fallback summary and one replacement.

- [ ] **Step 3: Document configuration and safety behavior**

README must cover order, eligible/prohibited failures, abort semantics, atomicity, and the fact that a fallback may cross providers and incur charges.

- [ ] **Step 4: Add the required Agent Note**

Record interfaces, behavior changes, migration considerations, keyless evidence, and verification commands.

### Task 8: Regenerate the root patch and verify the subsystem

**Files:**
- Modify: `patches/deepseek-harness-agent-pi.patch`
- Stage root application files from Tasks 4–6 only; never stage the nested checkout as a commit.

- [ ] **Step 1: Run all focused DSH tests**

```powershell
Set-Location vendor/deepseek-harness
pnpm exec vitest run packages/compaction/compaction-basic/tests/config.spec.ts packages/compaction/compaction-basic/tests/fallback.spec.ts packages/compaction/compaction-basic/tests/compaction-basic.spec.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run compaction package typecheck/build and the keyless snapshot**

Use the exact scripts declared in the affected package/root `package.json`.

Expected: no TypeScript errors and deterministic fallback snapshot passes.

- [ ] **Step 3: Run root desktop/profile/web tests**

```powershell
Set-Location ..\..\..
node --test scripts/compaction-profile.test.mjs apps/desktop/tests/compaction-preferences.test.mjs apps/desktop/tests/codex-auth.test.mjs
node --test bundles/tender-web/tests/compaction-settings.test.ts bundles/tender-web/tests/codex-settings.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 4: Regenerate and reverse-check the tracked DSH patch**

```powershell
git -C vendor/deepseek-harness diff --binary --output=../../patches/deepseek-harness-agent-pi.patch
git -C vendor/deepseek-harness apply --reverse --check ../../patches/deepseek-harness-agent-pi.patch
```

Expected: reverse-check succeeds and nested untracked files are excluded.

- [ ] **Step 5: Run the existing root patch-integrity test**

Locate it with `rg -n "deepseek-harness-agent-pi.patch|apply --reverse --check" package.json scripts tests`, then run the identified command.

Expected: patch integrity passes.

- [ ] **Step 6: Stage only this subsystem and inspect it**

```powershell
git add -- apps/desktop/compaction-preferences.mjs apps/desktop/tests/compaction-preferences.test.mjs apps/desktop/main.mjs apps/desktop/preload.cjs apps/desktop/package.json scripts/pack-runtime-payload.mjs scripts/init-tender-profile.mjs scripts/compaction-profile.test.mjs bundles/tender-web/lib/client.js bundles/tender-web/tests/compaction-settings.test.ts patches/deepseek-harness-agent-pi.patch
git diff --cached --check
git diff --cached --name-status
```

Expected: only compaction-related root files and the regenerated patch are staged.

- [ ] **Step 7: Commit the subsystem**

```powershell
git commit -m "feat(compaction): add DeepSeek summary fallback"
```
