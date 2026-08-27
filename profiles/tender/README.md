The `tender` profile is created under `$DSH_HOME/profiles/tender` by `scripts/init-tender-profile.mjs`.

Layer order:

1. `@deepseek-ai/dsh-base`
2. `@deepseek-ai/dsh-web-app`
3. `@dsh-external/dsh-super-injector` (BepInEx-style runtime injector; settings UI + `dev_*` tools)
4. `dsh-tender-host` (tools + evidence + HTTP `/api/agent-pi`)
5. `dsh-tender-web` (工作台 tab + 新建 overlay)

Also installed (not a profile bundle):

- `$DSH_HOME/.agent-presets/router-standard` — **Router Standard (experimental)**. Pick it in the new-session preset list. It is not forced as the default, so the tender workbench keeps the official Standard preset.

Skills are discovered via `$DSH_BUNDLED_SKILL_DIR` (repo `skills/`) and the workspace `.agents/skills` / `.dsh/skills` if present.

`scripts/verify-profile.ps1` dumps the composed config and asserts the Agent Pi bundles, the injector, and the router preset files.
