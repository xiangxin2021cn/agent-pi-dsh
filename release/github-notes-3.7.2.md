# Agent Pi DSH 3.7.2

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.7.2","kernel":{"releaseTag":"dsh-v0.1.7-rc.1","commit":"46a7f68b0922371ce7144b668b90e377d8e799f4"}} -->

本版基于稳定版 3.7.1，修复附件消息兼容性问题并升级官方 DSH 0.1.7-rc.1，不包含 RSI 实验功能。

- 修复附件提交时的 `format v4 message requires a producer-owned source kind` 错误，附件投递确认同步适配 V4 消息来源。
- 隐藏已提交消息中的内部附件事务标记，继续使用官方消息组件，保留图片、文件引用、复制与时间显示；不改写历史日志。
- 提示词优化和压缩插件同步使用生产方专属消息来源。
- 合入官方对会话滚动、历史翻页、排队消息换行、Excel 预览及选区保持的修复。
- 合入 PowerShell、后台命令和子智能体完成后唤醒、服务重启后重连，以及工具文字和图片预算处理的改进。
- 合入 rc.1 四档工作过程展示、工具准备进度和聊天图片放大预览；撤除产品旧二档开关的强制隐藏样式，在通用设置中使用官方展示选项。
- 合入 PDF 缩放、表格触控板操作、插件兼容检查及安装超时恢复，并更新官方 Office 技能运行库。
- AnySearch 0.1.6 尚未声明兼容此内核，保留插件与配置并遵循官方兼容检查；未获允许时，产品默认搜索切换为 DSH 官方服务。
- 保留 Univer Office 0.3.2、CAD、MPXJ 项目计划、资源文件栏、可选 Agent Teams、Codex、专业深度和手动模板。

MPP 支持读取、预览、字段编辑及导出 Microsoft Project XML；P6 支持 XER / PMXML。没有完整排程计算引擎，不直接写回 MPP。微信多图批次及跨轮图片引用的问题不在本次修复声明内。

升级前请退出正在运行的 Agent Pi DSH，再运行对应平台安装包。对于 3.7.1 中已经失败的任务，请重新添加附件并发送。Windows 包未进行代码签名。文件校验以本 Release 的 `.sha256` 为准。

本产品由 **Always π AI studio** 独立开发。发行许可为 **GPL-3.0-only**；CAD 对应源码归档随本 Release 提供。

[官方内核更新说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1)
