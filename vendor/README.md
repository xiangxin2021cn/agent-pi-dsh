# Vendored DSH plugins

Agent Pi DSH 3.8.1 uses the official `dsh-v0.2.1-alpha.1` release commit pinned by `DSH_PIN`, including pi-ai 0.87.1 and Cordis 4.0.5-alpha.1. Official core plugins, including Agent Teams, ship from that same unmodified source revision. Professional judgment is an additive product prompt section; no whole-system-prompt replacement is applied.

| Directory | Bundled version | Product role |
|---|---|---|
| dshmarket | 1.66.9 | Settings plugin market, with host peer gates, Electron restart and managed-component protection retained. |
| anysearch-dsh | 0.1.6 | Native search/fetch provider and tools; already-built official npm artifact. |
| dsh-super-injector | 0.3.5 | Local plugin injection host; incompatible legacy DOM settings section stays disabled. |
| dsh-router-standard | b39112dce54b90e67b50b166c2773861d7945d1f | Optional Router Standard preset; existing DSH compatibility overlay retained. |
| dsh-univer-office | 0.3.6 | Complete official Office plugin with same-origin viewer, platform runtime and upstream licenses. |
| dsh-genui | not bundled | Retired from factory profile; market installation remains a user choice. |
| dsh-vision-router | not bundled | Retired; official DeepSeek model handles native images. |

## Product compatibility changes

- Market: `compatibility.js` preserves the known IM boundary and the application-managed Team/compaction state. `src/verify.ts`, `hot.ts` and `routes.ts` retain these checks around activation and mutations. `src/restart.ts` delegates supervised restarts to Electron; the client uses the desktop relaunch API when present. Upstream's newer approval, rollback, dependency and origin checks remain in place. Office catalog text describes the actual bundled version. `node scripts/build-dshmarket.mjs` rebuilds the adapted host/client using the existing DSH toolchain. Source and compiled artifacts are shipped together.
- Market runtime: `js-yaml` and `undici` are pinned by tender-host's production lock and wired locally during profile initialization; schemastery resolves to the bundled DSH package. No dependency is downloaded on application launch.
- AnySearch: published 0.1.6 peer ranges exclude DSH 0.2.1-alpha.1. The reviewed product adapter appends only the exact current DSH/Cordis/schemastery prereleases and records original/adapted hashes in `AGENT-PI-ADAPTATION.json`. It also enforces the official 1–10 search count and format contract, strips credential-bearing upstream errors, and exposes safe credential metadata and a connection probe. The loader's compatibility gate remains enabled. The settings entry uses native credential writes; the registered client resolves the current key on every request, without restart.
- Injector: the product supplies React settings and removes the global rejection shield so host startup diagnostics remain effective. Reapply these bounded changes with `scripts/patch-super-injector.mjs`. Package pins and archive integrity are recorded in `core-plugins.pin.json` and the individual pins.
- Office: `dsh-univer-office.pin` locks the original 0.3.6 archive. Upstream includes the session-ticket/text-frame proxy fixes and both native worker dependencies. Materialization keeps the bounded host Config and client settings form compatibility adapter and native turn-tail list slot, and accepts only the reviewed DSH `0.2.1-alpha.1`, Cordis `4.0.5-alpha.1` and schemastery `3.18.5-alpha.1` prereleases in addition to the prior ranges. It records every resulting file hash and installs the declared dependencies from the production lock. Authorization and session/workspace checks remain intact. `scripts/univer-public-release.mjs` gates all platforms.
- User-installed registry plugins remain user-owned; upgrading the application does not install, update or remove the user's IM/mail packages. Their data and configuration are preserved. Incompatible IM generations and email builds still calling removed settings.register stay inactive with a concrete compatibility reason instead of breaking startup.

Developer-only DSH `.agents/skills` are excluded from the product runtime. The product skill directory is discovered through native DSH skills; file-delivery and report references load on demand. Templates and knowledge selections remain explicit user actions.
