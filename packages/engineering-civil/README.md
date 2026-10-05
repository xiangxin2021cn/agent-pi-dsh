# Road, drainage and civil geometric quantities

This package is a pure calculation kernel. The independently installed
`dsh-agent-pi-engineering-civil` bundle registers `civil-quantities` with the
existing engineering provider service; it adds no parallel project store or
native tool. The provider's `inputDescription` contains the full model-facing
input schema. All results remain `needs_review` and `purpose: geometric`.

`calculateCivil(data, {sources, dependencies})` supports explicitly documented:

- `pipe` / `drain`: a 2D or 3D polyline with `m` or `mm` coordinates. Unknown
  vertices are `null`. Only successive known vertices produce lengths; gaps are
  never bridged. Curved or unknown paths remain unsupported.
- `road_layer`: a simple explicitly closed 2D polygon, confirmed planar and
  without holes, multiplied by explicit positive thickness. The kernel checks
  self-intersections, nonadjacent touches/overlaps, degenerate edges/area and
  closure. Thickness has its own `m`/`mm` unit. This is not a sloped corridor or
  curved layer/terrain calculation.
- `rectangular`: explicit positive length, width and height with confirmed lack
  of voids. Excavation depths, slopes, working space and allowances are not inferred.
- `count`: a documented nonnegative safe integer. A known zero is retained;
  an unknown count stays null.

An independent `catalog` defines expected physical identities, scope and evidence.
It must be prepared from the original drawing inventory, not from successful
calculation results. Every catalog and calculation record references actual
source ID, SHA-256 and locator; sources must be active project records with local
paths and explicit source dependencies. The host validates actual file hashes.
Evidence/version errors block affected objects while other valid objects remain
calculable. Catalog evidence failure blocks its coverage claim.

Repeated `physicalId` or record IDs are blocked instead of counted twice or
silently choosing one view. Missing catalog objects remain missing. Objects not
in the catalog stay unlisted and outside totals. Exclusion requires a reason and
must not conflict with supplied calculation objects. Identity still needs
professional reconciliation: the kernel cannot establish that differently named
IDs refer to the same asset or that two counted groups spatially overlap.

Results provide each formula, source/version, known dimensions or segments,
explicit `quantity:null` for incomplete objects, and `knownPortion` for measured
parts of broken routes. Totals are grouped by kind, quantity basis and unit, with separate
`completeSubtotal`, `knownPartialSubtotal` and `knownSubtotal`. No known quantity
produces null, never an invented zero. `completeWithinDeclaredCatalog` describes
only the supplied inventory; it is not certification of all drawings, contract
measurement, fabrication or procurement quantities. Budgets are 200 calculation
objects, 1000 catalog items, 2000 vertices/path and 300 edges/polygon.
2D projected lengths and 3D spatial lengths are separate subtotal groups, even
when their units match; a missing object's unknown basis remains explicit.

`calibratePdf(data, evidence)` provides only a scale calibration based on an
actual known dimension. Source ID/hash, 1-based page and viewport ID must match.
Normalized coordinates are expanded by explicit viewport width and height before
distance calculation; pixel coordinates use those same viewport units. The
result preserves the complete dimension basis and hash-bound calibration ID,
metres per viewport pixel, and normalized X/Y scales. It does not infer physical
size from PDF DPI, read dimensions by OCR, measure objects automatically or reuse
one detail's scale elsewhere. Different crops, detail scales, nonuniform stretch
and perspective require new suitable evidence rather than reusing this scale.

Run meaningful geometry, omissions and persistence checks with:

```powershell
node --experimental-strip-types --test packages/engineering-civil/tests/civil.test.ts
```

The Windows sandbox may prohibit temporary snapshot-directory rename; normal
local test execution is needed for the real store integration case. Tests cover
hand-computed routes and volumes, millimetre conversions, interruptions,
self-intersections, exclusions, unknown values versus explicit zero, identities,
source dependencies, calibration frames, and provider unload preserving history.
