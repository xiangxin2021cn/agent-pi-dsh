# Model Capacity Resolution and Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve model context and output limits from user values, provider metadata, an exact verified catalog, or conservative estimates, and expose the selected value and its provenance consistently to settings and compaction.

**Architecture:** Extend the DSH model discovery contract with per-field provenance instead of adding a second capacity store. A small exact-ID catalog fills missing discovery fields, while persisted user values remain authoritative. The DeepSeek adapter and Agent Pi profile initializer share the approved 1,000,000 / 384,000 values, and the root patch remains the source of truth for the vendored DSH changes.

**Tech Stack:** TypeScript ESM, Zod schemas, React settings UI, Node.js ESM profile initializer, Vitest/Node test runner, root binary-safe vendor patch.

**Spec:** `docs/superpowers/specs/2026-08-28-codex-context-compaction-design.md`

## Global Constraints

- Product version remains exactly `3.3.5`.
- Capacity priority is user value > provider/deployment metadata > exact verified catalog > 262,144 / 32,768 estimate.
- Resolve context and output limits independently; one provider field must not suppress catalog/estimate resolution for the other field.
- Match only exact normalized model IDs and explicitly maintained aliases. Do not infer from substrings.
- Never overwrite an existing user-entered numeric capacity.
- Do not fetch arbitrary vendor web pages at runtime.
- Preserve unrelated root and `vendor/deepseek-harness` changes; regenerate only the tracked DSH patch.

---

### Task 1: Add a typed, exact-ID capacity resolver in DSH

**Files:**
- Create: `vendor/deepseek-harness/packages/llm/llm-pi-ai/src/capacity.ts`
- Create: `vendor/deepseek-harness/packages/llm/llm-pi-ai/tests/capacity.spec.ts`
- Modify: `vendor/deepseek-harness/packages/llm/llm-pi-ai/src/index.ts`

**Interfaces:**
- Export `type CapacitySource = "provider" | "official" | "estimated"`.
- Export `interface ResolvedModelCapacity { contextWindow: number; maxTokens: number; contextWindowSource: CapacitySource; maxTokensSource: CapacitySource }`.
- Export `resolveModelCapacity(modelId, providerCapacity)` where `providerCapacity` accepts optional `contextWindow` and `maxTokens`.
- Exact official entries:
  - `deepseek-v4-flash`: 1,000,000 / 384,000.
  - `deepseek-v4-pro`: 1,000,000 / 384,000.
  - `deepseek-v4-flash-vision-exp`: 1,000,000 / 384,000.
- Unknown fallback: 262,144 / 32,768 with `estimated` provenance.

- [ ] **Step 1: Write the failing resolver tests**

Cover exact DeepSeek IDs, an unknown ID, per-field mixing, and near-match rejection:

```ts
expect(resolveModelCapacity("deepseek-v4-flash", {})).toEqual({
  contextWindow: 1_000_000,
  maxTokens: 384_000,
  contextWindowSource: "official",
  maxTokensSource: "official",
});

expect(resolveModelCapacity("deepseek-v4-flash", {
  contextWindow: 500_000,
})).toMatchObject({
  contextWindow: 500_000,
  contextWindowSource: "provider",
  maxTokens: 384_000,
  maxTokensSource: "official",
});

expect(resolveModelCapacity("unknown-model", {})).toEqual({
  contextWindow: 262_144,
  maxTokens: 32_768,
  contextWindowSource: "estimated",
  maxTokensSource: "estimated",
});

expect(resolveModelCapacity("deepseek-v4-flash-preview", {}))
  .toMatchObject({ contextWindowSource: "estimated" });
```

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
Set-Location vendor/deepseek-harness
pnpm exec vitest run packages/llm/llm-pi-ai/tests/capacity.spec.ts
```

Expected: failure because `capacity.ts` does not exist.

- [ ] **Step 3: Implement the minimal resolver**

Use a frozen `Record<string, {contextWindow: number; maxTokens: number}>`, trim the incoming ID, and resolve each field independently. Do not add Kimi or speculative aliases in this task.

- [ ] **Step 4: Export the resolver from the package entrypoint**

Add only the type/value exports needed by discovery and tests.

- [ ] **Step 5: Re-run the focused test**

```powershell
pnpm exec vitest run packages/llm/llm-pi-ai/tests/capacity.spec.ts
```

Expected: all capacity resolver tests pass.

- [ ] **Step 6: Commit the logical DSH change in the root repository later**

Do not commit inside `vendor/deepseek-harness`; Task 7 regenerates and commits the root patch.

### Task 2: Carry capacity provenance through model discovery and the API boundary

**Files:**
- Modify: `vendor/deepseek-harness/packages/llm/llm/src/types.ts:221-230`
- Modify: `vendor/deepseek-harness/packages/llm/llm/src/index.ts:562-610`
- Modify: `vendor/deepseek-harness/packages/llm/llm/tests/topology.spec.ts`
- Modify: `vendor/deepseek-harness/packages/host/apiproxy/src/api/llm.ts:80-100`
- Modify: `vendor/deepseek-harness/packages/host/apiproxy/src/api/llm.schema.ts`
- Modify: `vendor/deepseek-harness/packages/host/apiproxy/tests/api-proxy-config.spec.ts`
- Modify: `vendor/deepseek-harness/packages/llm/llm-pi-ai/src/discovery.ts`
- Modify: `vendor/deepseek-harness/packages/llm/llm-pi-ai/tests/discovery.spec.ts`

**Interfaces:**
- Add optional `contextWindowSource?: CapacitySource` and `maxTokensSource?: CapacitySource` to `LlmDiscoveredModel`.
- Add the same optional fields to `DiscoveredModelView` and its wire schema.
- Discovery output must always return resolved numeric values and sources after applying provider > official > estimated.
- Existing installed catalog values are treated as `official`; custom `/models` fields are `provider`.

- [ ] **Step 1: Add failing core-copy and API round-trip tests**

Construct a discovered model with both source fields and assert `discoverModels()` plus the API response preserve them.

- [ ] **Step 2: Run the focused core/API tests and verify failure**

```powershell
pnpm exec vitest run packages/llm/llm/tests/topology.spec.ts packages/host/apiproxy/tests/api-proxy-config.spec.ts
```

Expected: the new source fields are absent or rejected by the schema.

- [ ] **Step 3: Extend the shared type, copy logic, API view, and Zod schema**

Use one exported union type from the core LLM package. Keep the new wire fields optional for backward compatibility.

- [ ] **Step 4: Add failing discovery priority tests**

Test these exact cases:

1. `/models` supplies both fields: both sources are `provider`.
2. `/models` supplies only context: context is `provider`, output comes from exact official catalog.
3. Exact DeepSeek ID with no metadata: both are `official`.
4. Unknown custom ID with no metadata: 262,144 / 32,768 and both are `estimated`.
5. Duplicate discovery entries retain the selected values and sources.

- [ ] **Step 5: Run discovery tests and verify failure**

```powershell
pnpm exec vitest run packages/llm/llm-pi-ai/tests/discovery.spec.ts
```

Expected: missing resolution/provenance assertions fail.

- [ ] **Step 6: Apply `resolveModelCapacity()` at the final discovery boundary**

Preserve raw provider metadata until the final result is assembled, then fill missing fields and sources. Do not mutate configured user profiles in discovery.

- [ ] **Step 7: Re-run all focused discovery and API tests**

```powershell
pnpm exec vitest run packages/llm/llm/tests/topology.spec.ts packages/host/apiproxy/tests/api-proxy-config.spec.ts packages/llm/llm-pi-ai/tests/discovery.spec.ts
```

Expected: all selected tests pass.

### Task 3: Persist and display user/provider/official/estimated provenance

**Files:**
- Modify: `vendor/deepseek-harness/packages/llm/llm-pi-ai/src/catalog.ts:534-570`
- Modify: `vendor/deepseek-harness/packages/llm/llm-pi-ai/src/config.ts`
- Modify: `vendor/deepseek-harness/packages/llm/llm-pi-ai/tests/config.spec.ts`
- Modify: `vendor/deepseek-harness/packages/client/ui-settings-models/src/client/store.ts`
- Modify: `vendor/deepseek-harness/packages/client/ui-settings-models/src/client/ModelListEditor.tsx:112-190`
- Modify: `vendor/deepseek-harness/packages/client/ui-settings-models/tests/provider-form.client.spec.tsx`

**Interfaces:**
- Persist optional `contextWindowSource` and `maxTokensSource` with values `"user" | "provider" | "official" | "estimated"`.
- A legacy configured numeric value without a source is interpreted as `user`.
- Editing a capacity field sets only that field's source to `user`.
- Adopting a discovered model copies the discovered value and source.
- The settings UI labels each field `用户设置`, `供应商返回`, `官方目录`, or `估算`.

- [ ] **Step 1: Add failing configuration compatibility tests**

Verify that the schema accepts all four sources, legacy profiles without sources still load, and invalid source strings are rejected.

- [ ] **Step 2: Add failing UI tests**

Assert:

```ts
// Existing user number remains unchanged after refresh/adoption.
expect(saved.contextWindow).toBe(existing.contextWindow);
expect(saved.contextWindowSource ?? "user").toBe("user");

// Unknown discovered model visibly reports estimate.
expect(screen.getByText("估算")).toBeTruthy();
```

Also cover manual editing changing provenance to `user`.

- [ ] **Step 3: Run the focused tests and verify failure**

```powershell
pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/client/ui-settings-models/tests/provider-form.client.spec.tsx
```

Expected: provenance persistence and labels are not implemented.

- [ ] **Step 4: Add optional persisted source fields and legacy normalization**

Keep the on-disk format backward compatible. Do not rewrite legacy files merely to add `user` unless the profile is otherwise saved.

- [ ] **Step 5: Update adopt/edit behavior and render compact source labels**

Use the existing form layout. Keep 256K / 32K as input hints only; the saved runtime values must come from the resolver.

- [ ] **Step 6: Re-run the focused configuration/UI tests**

```powershell
pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/client/ui-settings-models/tests/provider-form.client.spec.tsx
```

Expected: all selected tests pass.

### Task 4: Align the DeepSeek adapter's official output limits

**Files:**
- Modify: `vendor/deepseek-harness/packages/llm/llm-deepseek/src/index.ts:84-100`
- Modify: `vendor/deepseek-harness/packages/llm/llm-deepseek/tests/adapter.spec.ts:1510-1560`

**Interfaces:**
- The three approved built-in DeepSeek model entries expose `contextWindow: 1_000_000` and `maxTokens: 384_000`.
- The generic adapter fallback for unlisted models remains unchanged.

- [ ] **Step 1: Change the focused expectations to 384,000 and run them**

```powershell
Set-Location vendor/deepseek-harness
pnpm exec vitest run packages/llm/llm-deepseek/tests/adapter.spec.ts
```

Expected: official built-in model assertions fail against the current 256,000 output default.

- [ ] **Step 2: Add explicit capacities to the three built-in entries**

Do not change the generic `DEFAULT_MAX_TOKENS` used by unknown models.

- [ ] **Step 3: Re-run the adapter test**

```powershell
pnpm exec vitest run packages/llm/llm-deepseek/tests/adapter.spec.ts
```

Expected: all DeepSeek adapter tests pass.

### Task 5: Initialize and idempotently repair the Agent Pi DeepSeek model capacities

**Files:**
- Create: `scripts/deepseek-model-capacities.mjs`
- Create: `scripts/deepseek-model-capacities.test.mjs`
- Modify: `scripts/init-tender-profile.mjs:226-319`

**Interfaces:**
- Export `DEEPSEEK_MODEL_CAPACITIES`.
- Export `repairDeepSeekModelCapacities(yamlText): {yaml: string; changed: boolean}`.
- Only inspect exact model IDs inside the top-level `llm-deepseek.models` list.
- Insert a missing `contextWindow` or `maxTokens`; preserve any existing numeric value.

- [ ] **Step 1: Write failing repair tests using small YAML fixtures**

Cover:

1. all three values inserted into a new managed profile;
2. only a missing field is inserted;
3. user-modified values are preserved;
4. a similarly named custom model is untouched;
5. a second repair returns `changed: false` and byte-identical YAML.

- [ ] **Step 2: Run the tests and verify failure**

```powershell
node --test scripts/deepseek-model-capacities.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement a narrow line-oriented repair**

Use indentation and exact IDs to limit edits to `llm-deepseek.models`. Avoid parsing and serializing the full YAML because that would rewrite unrelated user formatting.

- [ ] **Step 4: Add the official values to newly generated managed model entries**

Update the initializer template so new profiles do not require a later repair.

- [ ] **Step 5: Invoke the repair for existing profiles after managed patch application**

If no fields are missing, do not rewrite the settings file.

- [ ] **Step 6: Re-run the repair tests twice**

```powershell
node --test scripts/deepseek-model-capacities.test.mjs
node --test scripts/deepseek-model-capacities.test.mjs
```

Expected: both runs pass; the idempotence fixture remains byte-identical on the second call.

### Task 6: Document the new DSH capacity contract

**Files:**
- Modify: `vendor/deepseek-harness/packages/llm/llm-pi-ai/README.md`
- Create: `vendor/deepseek-harness/.agents/notes/implemented/2026-08-28-model-capacity-provenance.md`

- [ ] **Step 1: Add concise README documentation**

Document the four-level priority, exact-ID-only catalog behavior, per-field resolution, and conservative unknown defaults.

- [ ] **Step 2: Add the required Agent Note**

Record the affected packages, new source fields, backward compatibility rule, exact verified DeepSeek entries, and focused verification commands. Do not claim unverified vendor values.

- [ ] **Step 3: Search for stale claims**

```powershell
rg -n "256000|256,000|262144|32768|contextWindowSource|maxTokensSource" packages/llm packages/client/ui-settings-models
```

Expected: generic 256,000 behavior is clearly scoped to unlisted adapter defaults; product-visible official DeepSeek entries use 384,000.

### Task 7: Regenerate the root DSH patch and verify the complete subsystem

**Files:**
- Modify: `patches/deepseek-harness-agent-pi.patch`
- Modify: root git index only for files listed in Tasks 1–6.

- [ ] **Step 1: Run focused DSH tests**

```powershell
Set-Location vendor/deepseek-harness
pnpm exec vitest run packages/llm/llm-pi-ai/tests/capacity.spec.ts packages/llm/llm-pi-ai/tests/discovery.spec.ts packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm/tests/topology.spec.ts packages/host/apiproxy/tests/api-proxy-config.spec.ts packages/llm/llm-deepseek/tests/adapter.spec.ts packages/client/ui-settings-models/tests/provider-form.client.spec.tsx
```

Expected: all selected tests pass.

- [ ] **Step 2: Run focused type checks/builds**

Use the package scripts declared in each affected `package.json`; do not guess command names. At minimum build the LLM core, pi-ai adapter, API proxy, DeepSeek adapter, and settings-models package.

Expected: all affected packages compile without TypeScript errors.

- [ ] **Step 3: Verify the profile initializer tests**

```powershell
Set-Location ..\..\..
node --test scripts/deepseek-model-capacities.test.mjs
```

Expected: all repair tests pass.

- [ ] **Step 4: Regenerate the tracked root patch without staging nested untracked files**

```powershell
git -C vendor/deepseek-harness diff --binary --output=../../patches/deepseek-harness-agent-pi.patch
git -C vendor/deepseek-harness apply --reverse --check ../../patches/deepseek-harness-agent-pi.patch
```

Expected: reverse-check succeeds, proving the patch exactly describes the tracked vendored changes.

- [ ] **Step 5: Run the repository patch integrity test**

Use the existing root test/script that validates `patches/deepseek-harness-agent-pi.patch`, identified with:

```powershell
rg -n "deepseek-harness-agent-pi.patch|apply --reverse --check" package.json scripts tests
```

Expected: the identified integrity test passes.

- [ ] **Step 6: Stage only capacity-related root files and the regenerated patch**

```powershell
git add -- scripts/deepseek-model-capacities.mjs scripts/deepseek-model-capacities.test.mjs scripts/init-tender-profile.mjs patches/deepseek-harness-agent-pi.patch
git diff --cached --check
git diff --cached --name-status
```

Expected: no nested `vendor/deepseek-harness` path is staged as an independent commit.

- [ ] **Step 7: Commit the subsystem**

```powershell
git commit -m "feat(models): resolve capacity with provenance"
```
