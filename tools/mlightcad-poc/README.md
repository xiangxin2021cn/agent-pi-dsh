# Agent Pi DSH MLightCAD PoC

Isolated, read-only DWG/DXF viewer built with Vite. The build output is written
to:

```text
bundles/tender-web/lib/cad-viewer
```

No `tender-host`, `tender-web` source, DSH kernel, or desktop host code is
modified by this PoC.

## Build

Use the Node installation bundled on this Windows host:

```powershell
& 'C:\Program Files\nodejs\node.exe' `
  'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' install
& 'C:\Program Files\nodejs\node.exe' `
  'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run check
& 'C:\Program Files\nodejs\node.exe' `
  'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
```

The three required local runtime assets are copied beside one another under
`workers/`:

- `mtext-renderer-worker.js`
- `libredwg-parser-worker.js`
- `libredwg-web.wasm`

`fixtures/minimal-r12.dxf` is a tiny local geometry smoke test.
`fixtures/text-entities-ac1015.dxf` covers `TEXT` and `MTEXT`. Fixtures are not
copied into the production bundle.

Serve the output over HTTP. MLightCAD checks Worker URLs with `HEAD`, and the
server must return `application/wasm` for `.wasm`. The existing Agent Pi DSH
static host already has the WASM MIME mapping; `file://` is not supported.

## Standalone use

Open the built `index.html` from an HTTP server and select a local `.dwg` or
`.dxf` file. The Agent Pi right-rail iframe passes the workspace file identity:

```text
/api/agent-pi/cad-viewer/index.html?cwd=C%3A%5Cworkspace&path=drawings%5Cplan.dwg
```

The page turns `cwd` + `path` into the existing same-origin raw-file endpoint.
For standalone diagnostics, `src` is also accepted but rejects cross-origin
URLs. The page opens drawings with `AcEdOpenMode.Read` and exposes only
navigation, layers, measurement, theme, and locale controls.

The iframe message contract is intentionally small:

- `{ type: 'agent-pi-cad:ready' }` after the requested drawing opens successfully
- `{ type: 'agent-pi-cad:error', message }`
- `{ type: 'agent-pi-cad:open-external' }`

Messages are sent only to `window.location.origin`. The parent remains
responsible for verifying both `event.origin` and `event.source`.

## Known PoC limits

- No DWG/DXF save or editing path is exposed.
- XRefs, proprietary custom objects, and some advanced entities can be absent.
- Very large drawings can still consume substantial browser memory.
- Source Han Sans CN 2.005 is bundled under SIL OFL 1.1 as an offline Chinese
  and Western fallback. Custom SHX, big-font encodings and CAD-specific glyphs
  may be substituted and are not guaranteed to match the authoring system.
- The open-source DWG parser path is GPL-3.0. Read `LICENSE-BOUNDARY.md` before
  including the generated directory in a distributed desktop package.
- The parser npm artifacts contain a GPL-3.0 metadata / bundled-MIT-text
  conflict. The generated notice records both facts rather than relabeling the
  upstream MIT text as GPL.
