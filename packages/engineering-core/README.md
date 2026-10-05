# Engineering records and providers

Pure TypeScript records for the first industry-plugin integration. No CAD parser,
reinforcement standard, geometry engine, BIM authoring or quantity calculator is
implemented by this package. A provider must implement and validate its declared
professional scope. A `reviewed` record is the caller's recorded review; schema
validation does not establish engineering correctness.

Import public types and functions from `index.ts`. Create a project with
`createEngineeringProject({ id, title })`; persist it in the owning project's
storage. `reviseEngineeringProject(current, patch, expectedRevision)` returns a
new snapshot, preserving omitted collections and replacing supplied arrays.
The host owns persistence, file access, user authorization and reviewer identity.

Every inspected source reference records its hash and locator. Parameter values
have explicit confirmation states; unknown values are `null`. Calculations bind
to specific source, parameter, object, adopted rule or upstream quantity inputs.
Set `inputFingerprint: engineeringInputFingerprint(project, dependencies)` when
recording a calculation. Changing source bytes leaves old references visible and
invalidates dependent results; it does not silently confirm re-extracted values.
Unrelated project changes do not invalidate engineering calculations.

Geometric, fabrication, contract and procurement records are distinct. Existing
contract baselines and rule adoptions are immutable; register another id for a
new baseline or adoption. `sumEngineeringQuantities` accepts only current
reviewed values with one purpose and one unit, and never silently skips gaps.
Coverage is a separately recorded scope checklist, not a count of found objects.

`EngineeringProviderRegistry` registers runtime parsing/audit and optional
execution functions with exact dependency versions and optional input guidance.
Dependency issues use `{ code, severity, message }` for host findings and runs.
Its disposer removes only the runtime contribution.
Project data and adopted rule versions are independent of provider lifetime.
This registry is not a filesystem sandbox or a tenant authorization service.

Run focused checks from the repository root:

```powershell
node --experimental-strip-types --test packages/engineering-core/tests/engineering-core.test.ts
```
