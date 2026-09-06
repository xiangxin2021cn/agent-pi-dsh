# Agent Pi DSH 3.6.2 — Codex 模型选择与原生附件

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.2","kernel":{"releaseTag":"dsh-v0.1.3-alpha.1","commit":"d347e703908d0406b7a7ef80e3a0e594d86b2215"}} -->

本版本完善 Codex 模型选择与主对话附件入口，内核继续固定到官方 **`dsh-v0.1.3-alpha.1`**（`d347e70390`）。Agent Pi 适配位于产品层，官方 DSH 内核源码保持干净。

## 2026-09-06 安装器修复重打

首批 Windows 安装包在覆盖升级时，清理旧 Office 目录可能沿目录链接误删共享 DSH 运行时文件，导致启动出现 `tender profile init failed (1)`。修复使用不跟随链接的清理程序，并在清理结束后校验本次安装应有的 DSH 文件；允许保留旧版本已经不用的额外文件，缺失或被修改的当前文件仍会阻止安装完成。

根据用户明确授权，本次在 **3.6.2 同一版本下重打并替换 Windows 安装包，其他平台资源撤下后重新生成**。所有产物通过校验后发布，应用版本及 DSH pin 不变。最终构建提交和产物身份以随附的 [Windows 构建回执](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.6.2/Agent-Pi-DSH-3.6.2-x64.exe.build.json)、各资产的 `.sha256` 文件及 [桌面构建 Actions 记录](https://github.com/xiangxin2021cn/agent-pi-dsh/actions/workflows/build-desktop-assets.yml) 为准；本次例外与验证范围记录于仓库的 `release/RELEASE_POLICY.md` 和 `release/validation-3.6.2.md`。

CAD 继续使用原已验证的本地 Worker、WASM 和字体资源。实际 CAD 构建输入未变化时，复用原产物及对应源码，无需重新运行 CAD 云构建；图纸解析仍在本机进行。

## 主要变化

- 设置页可选择并保存默认 Codex 模型。
- 主对话可为单次 Codex 委派选择模型；未单独指定时沿用设置中的默认值。
- 移除重复的附件上传入口，使用 DSH 原生附件上传与消息携带流程。

**公开安装包不预装 `dsh-univer-office` 插件及 Univer Pro 商业运行时。**

## 升级提醒

源代码回归、Codex RPC、隔离 Electron 窗口选模与原生附件上传已验证。发生故障的本机恢复缺失文件后，真实主界面启动通过，认证凭据保持不变。按用户选择，本次未执行真实产品安装、升级或卸载；重打验证范围为生产 NSIS 隔离升级 fixture 与解包应用独立启动。安装失败时的完整 DSH/runtime 回滚尚未实现。

升级前请完全退出旧版并备份应用数据。旧会话由官方运行时按需迁移，首次打开大型会话可能较慢；请勿同时使用两个版本写入同一会话。

## 许可与校验

项目代码和公开发行物继续采用 `GPL-3.0-only`；第三方组件保留各自原始条款。LibreDWG 对应源码随 Release 提供，文件为 `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`。

复用的 CAD 源码归档保留其原来源提交 `1aef6820ebc450125788158a4b2d1706115cdd10`；新安装器的修复来源单独记录在应用源码和新构建回执中。

安装包、运行时载荷和对应源码均提供配套 `.sha256` 文件，可用于校验下载完整性。
