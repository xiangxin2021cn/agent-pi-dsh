# Agent Pi DSH 3.7.3

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.7.3","kernel":{"releaseTag":"dsh-v0.1.7-rc.2","commit":"477b4f420553e8a52c2fbccc464d7561b239c443"}} -->

基于稳定版 3.7.2 升级官方 DSH 0.1.7-rc.2，保留附件 V4 消息修复，不包含 RSI 实验功能。

- 合入快捷键检索、修改和恢复功能；模型切换增加等待状态。
- 新启用的工具可供正在进行的对话使用，减少重新建会话的需要。
- 合入定时任务与运行记录能力；定时任务和时间上下文遵循官方默认关闭，由用户需要时启用。
- 修复异常退出留下的写入锁、插件安装中断后的恢复，以及部分长对话无法继续发送的问题。
- 改善过长工具输出的字符截断、插件详情、审批说明本地化、归档筛选和文档预览。
- 减少标准模式固定指令开销；账号和 API Key 模型入口、插件兼容提示按官方机制处理。
- 官方 Office 运行库更新为 LibreOffice Kit 0.1.1；保留完整 Univer Office 0.3.5、CAD、MPXJ、资源文件栏、可选 Agent Teams、Codex、专业深度与手动模板。
- Univer 0.3.5 修复 Windows 重复备份，原生兼容新卡片与设置接口；插件市场更新至 1.65.1，保留本应用的重启与插件兼容处理。

本应用继续使用现有 Electron 桌面壳。官方独立桌面壳新增的首次引导、关闭窗口转后台及专属升级界面，不属于本次内核替换自动获得的能力。

MPP 可读取、编辑字段并导出 Project XML；P6 支持 XER / PMXML，不包含完整排程引擎。本次不宣称解决微信多图批次及跨轮图片引用问题。AnySearch 若不符合官方兼容检查，保留配置并使用官方搜索，不自动绕过校验。

升级前退出正在运行的 Agent Pi DSH。Windows 建议使用默认或较短安装目录；包未进行代码签名。校验值以同一 Release 的 `.sha256` 文件为准。

本产品由 **Always π AI studio** 独立开发，发行许可为 **GPL-3.0-only**，CAD 对应源码归档随 Release 提供。

[官方 rc.2 更新说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)
