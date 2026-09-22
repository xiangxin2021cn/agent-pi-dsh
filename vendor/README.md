# Vendored DSH plugins

Agent Pi DSH 3.7.1 uses the official `dsh-v0.1.7-alpha.1` core pinned by `DSH_PIN`. Official core plugins, including Agent Teams, ship from that same unmodified source revision. No whole-system-prompt replacement is applied.

| Directory | Bundled version | Product role |
|---|---|---|
| dshmarket | 1.55.0 | Settings plugin market, with Electron restart and managed-component protection retained. |
| anysearch-dsh | 0.1.6 | Native search/fetch provider and tools; already-built official npm artifact. |
| dsh-super-injector | 0.3.5 | Local plugin injection host; incompatible legacy DOM settings section stays disabled. |
| dsh-router-standard | b39112dce54b90e67b50b166c2773861d7945d1f | Optional Router Standard preset; existing DSH compatibility overlay retained. |
| dsh-univer-office | 0.3.2 | Complete official Office plugin with same-origin viewer, platform runtime and upstream licenses. |
| dsh-genui | not bundled | Retired from factory profile; market installation remains a user choice. |
| dsh-vision-router | not bundled | Retired; official DeepSeek model handles native images. |

## Product compatibility changes

- Market: `compatibility.js` preserves the known IM boundary and the application-managed Team/compaction state. `src/verify.ts`, `hot.ts` and `routes.ts` retain these checks around activation and mutations. `src/restart.ts` delegates supervised restarts to Electron; the client uses the desktop relaunch API when present. Upstream's newer approval, rollback, dependency and origin checks remain in place. Office catalog text describes the actual bundled version. `node scripts/build-dshmarket.mjs` rebuilds the adapted host/client using the existing DSH toolchain. Source and compiled artifacts are shipped together.
- Market runtime: `js-yaml` and `undici` are pinned by tender-host's production lock and wired locally during profile initialization; schemastery resolves to the bundled DSH package. No dependency is downloaded on application launch.
- AnySearch: the published peer ranges predate DSH 0.1.7. The product wires the native tool-web/system-prompt peers and verifies startup and native fetch registration against the actual core. The upstream implementation is retained unchanged; ordinary web fetch stays on the existing product provider choice.
- Injector: the product supplies React settings and removes the global rejection shield so host startup diagnostics remain effective. Reapply these bounded changes with `scripts/patch-super-injector.mjs`. Package pins and archive integrity are recorded in `core-plugins.pin.json` and the individual pins.
- Office: `dsh-univer-office.pin` locks the original 0.3.2 archive. Upstream now includes the session-ticket/text-frame proxy fixes and both native worker dependencies. Materialization adapts the host Config and client settings form to DSH 0.1.7 and keeps the native turn-tail list slot; it records every resulting file hash and installs the declared dependencies from the production lock. Authorization and session/workspace checks remain intact. `scripts/univer-public-release.mjs` gates all platforms.
- User-installed registry plugins remain user-owned; upgrading the application does not install, update or remove the user's IM/mail packages. Their data and configuration are preserved. Incompatible IM generations and email builds still calling removed settings.register stay inactive with a concrete compatibility reason instead of breaking startup.

Developer-only DSH `.agents/skills` are excluded from the product runtime. The product skill directory is discovered through native DSH skills; file-delivery and report references load on demand. Templates and knowledge selections remain explicit user actions.
