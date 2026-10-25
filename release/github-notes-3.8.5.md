# Agent Pi DSH 3.8.5 主线版

本版使用原生 DSH 主界面和已有专业工作台。投标专版继续使用独立分支、安装标识、用户目录与发布标签，不纳入本次主线安装包。

应用源码仍固定在公开标签 `v3.8.5`（`d8b8e6d1a55ff3e383b340f09cca44d2e38478cf`）。后续发布维护提交只修正 CI、Mach-O 扫描器和系统要求说明，不移动标签或更换应用、运行时及核心组件。Windows、Linux 继续使用已通过验证的原资产；全平台发行以各平台验收及 Release 资产门禁为准。

## 主要更新

- 官方 DSH 固定为 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，包版本 `0.2.1-rc.3`；这是固定源码快照，不表示安装了发布当天最新上游版本。
- Node.js 24.22.1、Electron 45.0.0、electron-builder 26.18.0、Codex CLI 0.164.0、Market 1.70.0；保留完整官方 Univer Office 0.3.7、AnySearch 0.1.8、知识库、个人技能及专业工作台。
- 保留共同任务、工作台与主对话的暂停、继续、问题处理和成果核验链。修复冷恢复 Codex 发送、项目与原生会话往返、外部工具历史事件顺序；历史失败会显示原因，不以空会话代替。
- 桌面后台按实例选择空闲端口，关闭时仅清理本实例创建的进程；不再按固定端口终止其他应用。
- 补齐跨平台桌面入口依赖和随包 npm/pnpm，确保 Office 依赖修复及插件管理使用随包运行时。

## 下载与安装

| 平台 | 资源 |
| --- | --- |
| Windows x64 | `Agent-Pi-DSH-3.8.5-x64.exe` |
| macOS Apple Silicon | `Agent-Pi-DSH-3.8.5-mac-arm64.dmg` / `.zip` |
| macOS Intel | `Agent-Pi-DSH-3.8.5-mac-x64.dmg` / `.zip` |
| Linux x64 | `Agent-Pi-DSH-3.8.5-linux-x86_64.AppImage` / `Agent-Pi-DSH-3.8.5-linux-amd64.deb` |

安装前保存文件并退出主线应用及托盘进程，使用默认安装目录。主线继续使用原 `agent-pi-dsh-desktop` 用户目录；请先备份重要项目。主线与投标版不要同时编辑同一个项目文件。

macOS 系统要求：Apple Silicon 与 Intel 均为 macOS 15 及以上。两架构保留原生语音、工具和完整 Office 能力，最低系统要求由实际随包原生库决定；平台构建分别检查整包 Mach-O 部署目标。各自 GitHub runner 上的验证不代表所有支持系统已实机验收。安装包未签名，macOS 未公证。

## 功能与边界

主对话用于提出目标与修正，专业工作台用于组织项目、审批、查看来源和成果；“本次任务”使用同一项目记录。Office 继续通过文件预览与编辑入口打开。知识库保留不可变材料版本，上传资料、工具调用完成或文件导出均不等于专业结论已通过人工验收。

Windows 保留已审核的内置 BIM/IFC 引擎；macOS/Linux 使用兼容的外部 IFC 引擎。CAD 沿用已审核的 clean viewer 和独立 patched host decoder，不将旧构建产物改写为本版新编译。Windows BIM 在过深自定义路径下仍可能遇到原生库路径长度限制，建议默认安装目录。

既有 Windows 隔离验收已覆盖原会话副本的严格重放与持久化重开、原生主界面、专业工作台往返、完整 Univer 交互、知识库和技能。公开构建另核对实际载荷、原生依赖和平台资产；未在真实用户目录执行安装向导或项目迁移，未新增付费模型测试，不宣称已完成真实模型长任务或工程专业结论验收。

## 对应源码与使用资料

本次 Release 保留真实来源身份并提供各自 SHA256：

- `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`：clean CAD viewer。
- `Agent-Pi-DSH-3.8.2-CAD-host-corresponding-source.tar.gz`：独立 patched host decoder。
- `Agent-Pi-DSH-3.8.0-BIM-corresponding-source.tar.gz`：已审核的 Windows IFC 引擎来源及装配材料。
- `runtime-payload-3.8.5.tar.gz`：本次平台构建的固定载荷。

[3.8.5 核心组件与来源](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.8.5/release/3.8.5-core-components.json) · [主线与投标版的边界](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.8.5/release/3.8.5-product-editions.md) · [主对话和工程工作台用法](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.8.5/docs/3.8.2-user-guide.md)。GPL 与第三方原始许可继续适用，Office 原有授权机制保留。

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.8.5","kernel":{"sourceKind":"official-master-snapshot","packageVersion":"0.2.1-rc.3","commit":"22ddee3792402c3e70ec5f86a63c3e3e895a2f60"}} -->
