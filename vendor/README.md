# Vendored DSH plugins

These packages are **not** DeepSeek Harness. They are third-party DSH plugins
that Agent Pi DSH ships so a packaged Windows build can initialize offline.

| Directory | Upstream | Role |
|-----------|----------|------|
| `dsh-super-injector/` | [dsh-super-injector v0.3.1](https://github.com/yjh051108/dsh-super-injector) release tarball | Official-assembly injector (`@dsh-external/dsh-super-injector`). After one profile add, runtime tools (`dev_inject_plugin`, …) can load more local plugins without restart. |
| `dsh-router-standard/` | [dsh-router-standard](https://github.com/yjh051108/dsh-router-standard) (from [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)) | User agent preset **Router Standard (experimental)**. Installed under `$DSH_HOME/.agent-presets/router-standard`. Optional in the session picker — not forced as the default. |
| `dshmarket/` | [dshmarket 1.10.1](https://www.npmjs.com/package/dshmarket) npm tarball | Visual plugin market inside Settings (发现/主题/已安装/备份与恢复). Preinstalled offline; keeps itself current through its own update channel. |
| `dsh-vision-router/` | retired in 3.3.1 | Kept on disk for rollback only. Not installed, not packed. Official `deepseek-v4-flash-vision-exp` understands images. |
| `dsh-genui/` | [dsh-genui 0.8.7](https://github.com/omdsh-dev/dsh-genui) source + built `lib/` | Retired from the factory profile. Not packed, not linked. A leftover `$DSH_HOME` install can be uninstalled in Settings; later installs go through the market / GitHub URL. |
| `anysearch-dsh/` | [anysearch-dsh 0.1.1](https://github.com/anysearch-team/anysearch-dsh) source + built `lib/` | Web search provider + tools. Preinstalled as a `link:` junction. Official docs say `--profile web`; this product uses `tender`. |
| `dsh-univer-office/` | [dsh-univer-office 0.2.9](https://github.com/dream-num/dsh-univer-office) npm tarball | In-chat Sheet/Doc/Slide preview and formula edit. Unpacked tree is gitignored (`vendor/dsh-univer-office.pin` is the pin). Official docs say `--profile web`; this product uses `tender`. |

Local modifications:

- `dsh-super-injector/lib/client.js` (and the `lib/client/index.js` mirror): `apply()` short-circuits before registering its `settings.section`. That section speaks a `component:{render()}` DOM protocol from a different host generation; on this DSH the slot renderer mounts the second register argument as a React component, so the entry rendered `undefined` and crashed the settings panel (React #130). Injection management is covered by the native plugins page and dshmarket; the host half (`/super-injector/api`, `dev_inject_plugin`) is untouched.
- `dsh-vision-router/` is retired from the factory profile in 3.3.1. Leftover `link:` / registry installs are stripped on the next managed boot.
- `dshmarket` install / approve-builds: catalog names omit the npm scope (`dsh-genui` vs `@omdsh-dev/dsh-genui`). pnpm `allowBuilds` matches the *package* name plus `name@git+https://github.com/owner/repo.git`. Write every candidate before `dsh plugin add`, and treat `@owner/name` as the same plugin when the market later retries. Confirm does not mean the first add already had a valid key — that was why 放行 still failed.
- `dshmarket` restart banner: the status poll is the only writer of `hostBusy`. Stopping it after install/update/uninstall must clear that lock, or 「立即重启」 stays disabled. On Agent Pi the button prefers `window.agentPiDesktop.relaunch()` (Electron `app.relaunch`). Hosts with `AGENT_PI_DESKTOP=1` or `DSH_BUNDLED_SKILL_DIR` never spawn a second raw `dsh`; they write `request-relaunch.json` and exit so the shell owns the replacement.
- `dsh-genui/`: kept on disk for rollback only. Factory profile no longer links or packs it. Do not run `pnpm prepare` on the copy.
- `anysearch-dsh/`: vendored at 0.1.1 with upstream `lib/` already built. Do not run `pnpm prepare` (`tsc`). `node_modules` stay out of the copy; `init-tender-profile.mjs` junctions `@deepseek-ai/*` peers plus `schemastery` into the running DSH checkout. Managed overlay sets `searchProvider: anysearch` when the bundle is present.
- `dsh-univer-office/`: vendored at 0.2.9 from the npm tarball. The unpacked ~157MB tree and its native `node_modules` stay out of git. `scripts/vendor-dsh-plugins.ps1` re-downloads the pin. `init-tender-profile.mjs` links it when `lib/index.js` is present and junctions DSH peers; first boot may `npm install --omit=dev` inside the vendor dir. Do not merge Univer worktrees unless the user asks.
- Desktop `web_fetch` overlay: `scripts/enable-desktop-web-fetch.mjs` sets `tool-web.fetch: true` in the pinned DSH `standard`/`code`/`cordis` presets and in `dsh-router-standard`. Stock DSH leaves fetch off; this machine is a local workbench. Host-plane `web-fetch-http` is junctioned by `init-tender-profile.mjs` and must **not** be listed in the profile `package.json` dependencies (the market would show a false verification failure — the package has no `dsh` metadata).
- Conversation / injector installs that declare `dsh.bundle` stay in `dsh.profile.bundles` across restarts. `init-tender-profile.mjs` no longer overwrites the list with a fixed factory set.

Refresh copies:

```powershell
.\scripts\vendor-dsh-plugins.ps1
```

`vendor/deepseek-harness` is pinned by `DSH_PIN` to the official `dsh-v0.1.2-rc.1` release (`a66e470204`). The old Agent Pi patch targets `dsh-v0.1.1-rc.2` and is retained only as a porting inventory; it must not be applied to the current kernel. Agent Pi compatibility stays in product startup migration, profile overlays and bundles so the official checkout remains byte-clean.
