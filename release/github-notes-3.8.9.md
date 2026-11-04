# Agent Pi DSH 3.8.9 主线版

- DSH 升级到官方 [dsh-v0.2.2-alpha.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.3)，固定提交 `05b1cae8db6e674c5685101494d4eec24652424a`。这版包含历史会话恢复及长程任务状态修复。产品 profile 延续文件修改前读取及并发变更检查。
- 桌面运行时升级到 Electron 45.2.2，独立 Node.js 继续使用 24.22.2。插件市场升级到 1.73.10，保留独立联网检查和历史错误标识。PDF.js 升级到 6.5.438，Marked 升级到 18.1.3。
- 保留完整 Univer Office 0.4.0、知识库、工程插件和现有工作台。Windows 带审核过的 IFC 运行库。macOS 与 Linux 使用外部 IFC 引擎。
- macOS Apple Silicon 和 Intel 最低支持 macOS 15。DMG 使用 APFS，发行流程要求 Developer ID 签名、Apple 公证、最终镜像原生校验和只读挂载。

本次发行适用于主线应用。投标专版独立维护。

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.8.9","kernel":{"releaseTag":"dsh-v0.2.2-alpha.3","commit":"05b1cae8db6e674c5685101494d4eec24652424a"}} -->
