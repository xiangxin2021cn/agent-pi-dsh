# Release policy

Agent Pi DSH 的公开版本与资源不可变。

1. 功能和内核升级先进入独立分支，通过 Pull Request 以 merge commit 合并到 `main`。
2. 标签只能在 PR 合并后从 `main` 创建；不得移动或复用已经公开的标签。
3. `DSH_PIN` 每次变化都必须提升 Agent Pi DSH 的应用版本。
4. Release 先保持 draft；Windows、macOS、Linux 和运行时资源全部成功后才发布为 Latest。
5. 上传命令不得使用 `--clobber`。资源有误时提升版本重新发布，不覆盖同版本。

`kernel-version-policy` CI 比较 PR base 与 head；Windows 和跨平台打包还会核验 `release/kernel-version-history.json`。
