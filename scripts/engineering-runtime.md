# Engineering runtimes on Windows

The desktop already stages `bundles/tender-host/node_modules`. PDF and CAD
plugins resolve their existing dependencies relative to that bundle's package
manifest. Keep PDF.js `cmaps`, `standard_fonts`, `wasm`, native canvas packages,
and the clean CAD viewer's `workers/libredwg-web.wasm`. The latter is not shipped
in the npm libredwg-web package. `verify-engineering-runtime.mjs <product>` checks
local module resolution, real tiny-text PDF extraction, direct ROI rendering,
pixel color, native canvas, and actual WASM/database/converter loading. It does
not claim representative DWG parsing accuracy.

## Optional BIM engine

The bundle-relative location is
`<product>/bundles/engineering-bim/runtime/python/python.exe`.
The runner chooses explicit plugin configuration, then
`AGENT_PI_BIM_PYTHON_PATH`, then this existing bundled interpreter, then PATH.
No dependency is installed or downloaded on startup. The engine is replaceable
independently of the host, and disabling its plugin prevents its use.

`stage-bim-runtime.py` is a Windows CPython 3.13.7 x64 private-validation recipe
for the fixed, tested IfcOpenShell 0.8.5 dependency closure. It copies only its
eight recorded Python distributions, stdlib/native DLLs and retained licenses;
it never changes the source interpreter. The isolated `_pth` file prevents
registry/user-site/PYTHONPATH resolution. The output must be a new directory.

Provide a local evidence directory with official IfcOpenShell `COPYING`,
`COPYING.LESSER`, and `win-build-deps.cmd`, plus `sources.json` entries of
`{file,url,sha256}`. Use exact core commit
`1c5b825d8ef05ab9d14a15dac12e9eae2f5a37c2` from
`https://raw.githubusercontent.com/IfcOpenShell/IfcOpenShell/<commit>/`;
the build script's upstream path is `win/build-deps.cmd`.

```powershell
& '<explicit-source-python.exe>' -I -B scripts/stage-bim-runtime.py `
  --output .codex-temp/engineering-bim-runtime-local `
  --license-dir .codex-temp/bim-license-evidence
node scripts/verify-bim-runtime.mjs .codex-temp/engineering-bim-runtime-local

# Include only in a private local validation build. Existing pack:win forwards
# these variables to prepare-win-runtime.ps1 without changing its build steps.
$env:AGENT_PI_BIM_RUNTIME_SOURCE = (Resolve-Path .codex-temp/engineering-bim-runtime-local).Path
$env:AGENT_PI_BIM_LOCAL_ONLY = '1'
# Run the repository's normal full Windows packaging command.
```

Both `verify-bim-runtime.mjs <runtime>` and
`verify-bim-runtime.mjs --product <product>` check receipt hashes and run with a
minimal environment whose PATH contains only Windows System32. The latter also
calls the real plugin runner without interpreter options/environment overrides,
asserts that it chose the bundled Python, generates an IFC slab and checks its
6 m3 geometric volume. A copied runtime is about 153.4 MiB before compression.

## Public redistribution gate remains closed

```powershell
node scripts/verify-bim-runtime.mjs .codex-temp/engineering-bim-runtime-local --public
```

This deliberately fails for the current local staging. If a runtime source is
provided without the local-only flag, normal preparation invokes this gate.
The receipt and RUNTIME-NOTICE identify `license-review-required`. IfcOpenShell's
LGPL metadata is insufficient to identify all compiled code in the wheel:
the exact official Windows build script also includes GPL CGAL, OCCT,
MPIR/MPFR, and other native dependencies. Complete corresponding source/build
inputs, exact native dependency notices and the distribution method still need
review. Separate-process use and replaceability do not remove applicable
LGPL/GPL duties. A public release must not merely relabel this receipt; it needs
the actual reviewed source/license closure and an updated packaging recipe.

The local evidence includes original GPL/LGPL texts, exact URLs/hashes, installed
distribution metadata/licenses and source acquisition pointers. These support
the review; they do not establish a completed public release compliance review.
