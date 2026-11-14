# Vendored DSH plugins

Agent Pi DSH 3.9.0 pins the unmodified official DSH 0.2.2-rc.3 master commit `39163dd30f703a79079e2d2446545cff3c453738` and its frozen dependency lock. Official Team support is now part of the native base/web bundles, with a per-session switch. Product professional guidance remains additive.

| Directory | Bundled version | Product role |
|---|---|---|
| dshmarket | 1.73.19 | Settings plugin market, with host peer gates, Electron restart and managed-component protection retained. |
| anysearch-dsh | 0.1.8 | Native search/fetch provider and tools; already-built official npm artifact. |
| dsh-super-injector | 0.3.5 | Local plugin injection host; incompatible legacy DOM settings section stays disabled. |
| dsh-router-standard | 0.1.0 compatible runtime | Optional existing preset with snapshotEvents adaptation. Upstream 0.3.0 needs separate session and shell-policy migration. |
| dsh-univer-office | 0.4.0 | Complete official Office plugin with same-origin viewer, platform runtime and upstream licenses. |
| dsh-genui | not bundled | Retired from factory profile; market installation remains a user choice. |
| dsh-vision-router | not bundled | Retired; official DeepSeek model handles native images. |

## Product compatibility changes

- Market: `compatibility.js` preserves the known IM boundary and the application-managed Team/compaction state. `src/verify.ts`, `hot.ts` and `routes.ts` retain these checks around activation and mutations. `src/restart.ts` delegates supervised restarts to Electron; the client uses the desktop relaunch API when present. Upstream's newer approval, rollback, dependency and origin checks remain in place. Office catalog text describes the actual bundled version. `node scripts/build-dshmarket.mjs` rebuilds the adapted host/client using the existing DSH toolchain. Source and compiled artifacts are shipped together.
- Market runtime: `js-yaml` and `undici` are pinned by tender-host's production lock and wired locally during profile initialization; schemastery resolves to the bundled DSH package. No dependency is downloaded on application launch.
- AnySearch: the published 0.1.8 peer ranges are retained; the product separately gates the reviewed DSH 0.2.2-rc.3 through engines.dsh. The reviewed product adapter appends only the exact current DSH/Cordis/schemastery prereleases and records original/adapted hashes in `AGENT-PI-ADAPTATION.json`. It also enforces the official 1–10 search count and format contract, strips credential-bearing upstream errors, and exposes safe credential metadata and a connection probe. The loader's compatibility gate remains enabled. The settings entry uses native credential writes; the registered client resolves the current key on every request, without restart.
- Injector: the product supplies React settings and removes the global rejection shield so host startup diagnostics remain effective. Reapply these bounded changes with `scripts/patch-super-injector.mjs`. Package pins and archive integrity are recorded in `core-plugins.pin.json` and the individual pins.
- Office: `dsh-univer-office.pin` locks the complete official 0.4.0 archive and Apache-2.0 license. The bounded rc.3 adapter consumes the authenticated Peer passed by WebServer for HTTP and WebSocket routes, requires a live owner, and retains session/workspace file checks. Materialization receipts bind every resulting file and the adapter; platform dependencies remain mandatory. The native Office Kit 0.2.3 now resolves from `packages/document/office-kit`.
- User-installed registry plugins remain user-owned; upgrading the application does not install, update or remove the user's IM/mail packages. Their data and configuration are preserved. Incompatible IM generations and email builds still calling removed settings.register stay inactive with a concrete compatibility reason instead of breaking startup.

Developer-only DSH `.agents/skills` are excluded from the product runtime. The product skill directory is discovered through native DSH skills; file-delivery and report references load on demand. Templates and knowledge selections remain explicit user actions.

The 2026-11-14 review is recorded in `release/core-plugin-audit-3.9.0.json`. Super Injector 0.3.5 is the latest published release; 0.3.6 is an unreleased source version. Writing-DNA retains the reviewed MIT commit: the newer source adds a noncommercial restriction and is not shipped in customer document workflows.
