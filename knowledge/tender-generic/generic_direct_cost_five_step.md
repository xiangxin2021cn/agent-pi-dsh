# Generic five-step direct-cost method (international)

Use this note as the **method & depth standard** when the project boundary selects `pricingStandard: generic_direct_cost_v1`.

This is **not** a COTO / C5.1 clone. Adapt clause language to the tender’s own specification and measurement rules.

## Purpose

Guide BOQ item workpapers so an estimator can:

1. Lock the measured item identity
2. State scope / measurement basis from the tender
3. Derive method and productivity
4. Build resource consumption per BOQ unit
5. Apply dated, located market rates (VAT / tax stance from `project_boundary`)
6. Reconcile unit rate and item total with explicit risks

## Five steps (required shape)

### Step 1 — Scope & measurement

- Preserve BOQ code, description, unit, quantity, and row source exactly
- Cite specification and measurement/payment clauses **when the tender provides them**
- State inclusions, exclusions, testing, and method constraints (use reasoned N/A when truly not applicable)

### Step 2 — Method & productivity

- Method sequence, crew (if labour/plant included), bottleneck, working hours
- Optimistic / base / pessimistic productivity with consistent units

### Step 3 — Resource consumption

- Every included resource kind per BOQ unit, linked to a cost component

### Step 4 — Sourced rates → direct cost

- Dated, located rates with acquisition mode and source type
- Honour `project_boundary.pricing.taxRegime` (do not assume VAT exclusive unless the boundary says so)
- Verify key rates online when the boundary’s `mustVerifyOnline` list requires it; otherwise mark `unverified`
- Item unit rate is **direct cost under the chosen pricingStandard** — do not silently fold corporate overhead/profit unless the boundary’s indirect-cost policy says so

### Step 5 — Reconciliation & risk

- Reconcile unit rate × quantity
- Item-specific risk sensitivity (optimistic / base / pessimistic)

## Discipline

- Numbers are plain decimals (no thousands separators)
- Every numeric fact is sourced, an explicit scenario, or unverified
- Do not invent project facts from this template or from other projects’ sample files
- Read `project_boundary` (profile, currency, measurement standard, organisation outline) before pricing
