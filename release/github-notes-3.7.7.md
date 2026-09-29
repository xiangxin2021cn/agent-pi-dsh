# Agent Pi DSH 3.7.7

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.7.7","kernel":{"releaseTag":"dsh-v0.2.0-rc.1","commit":"4878cdabd87d4041bdaff61d04c966883b9fd07a"}} -->

本版将内核固定到 [DeepSeek Harness 官方 0.2.0-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1) 的提交 `4878cda`。官方本次改进会话状态与图片恢复、插件管理、Office/PDF 预览选区、工具调度异常后的恢复，以及 Windows 文件定位和窗口遮挡；自动化任务改为可选插件。内核源码不修改，构建与发行物采用逐文件收据核验。

Office 载体继续采用完整的 `dsh-univer-office` 0.3.5，保留应用内编辑、预览、工作树和审核能力。产品仅为其七项 DSH 依赖声明加入本次内核版本，隔离桌面冷启动已验证主机及客户端加载。对 [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) 的评估见 [Office 载体评估](../docs/office-carrier-evaluation-3.7.7.md)：其结构化 CLI/MCP 值得独立试点，但目前不替换 Univer。本版不迁移用户 Office 数据。

产品层任务引导、专业工作台、CAD、项目计划、Codex 入口与既有插件边界继续保留。Windows 安装包未签名；本产品由 **Always π AI studio** 独立开发，许可为 **GPL-3.0-only**。
