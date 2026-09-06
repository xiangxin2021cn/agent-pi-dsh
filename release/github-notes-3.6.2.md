# Agent Pi DSH 3.6.2 — Codex 模型选择与原生附件

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.2","kernel":{"releaseTag":"dsh-v0.1.3-alpha.1","commit":"d347e703908d0406b7a7ef80e3a0e594d86b2215"}} -->

本版本完善 Codex 模型选择与主对话附件入口，内核继续固定到官方 **`dsh-v0.1.3-alpha.1`**（`d347e70390`）。Agent Pi 适配位于产品层，官方 DSH 内核源码保持干净。

## 主要变化

- 设置页可选择并保存默认 Codex 模型。
- 主对话可为单次 Codex 委派选择模型；未单独指定时沿用设置中的默认值。
- 移除重复的附件上传入口，使用 DSH 原生附件上传与消息携带流程。

**公开安装包不预装 `dsh-univer-office` 插件及 Univer Pro 商业运行时。**

## 升级提醒

源代码回归、Codex RPC、隔离 Electron 窗口选模与原生附件上传已验证。实际安装/卸载测试尚未执行；安装失败时的完整 DSH/runtime 回滚尚未实现。

升级前请完全退出旧版并备份应用数据。旧会话由官方运行时按需迁移，首次打开大型会话可能较慢；请勿同时使用两个版本写入同一会话。

## 许可与校验

项目代码和公开发行物继续采用 `GPL-3.0-only`；第三方组件保留各自原始条款。LibreDWG 对应源码随 Release 提供，文件为 `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`。

安装包、运行时载荷和对应源码均提供配套 `.sha256` 文件，可用于校验下载完整性。
