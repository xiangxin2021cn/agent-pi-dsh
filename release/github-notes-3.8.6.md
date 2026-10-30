# Agent Pi DSH 3.8.6 主线版

主线继续使用 DSH 原生主界面和已有专业工作台。投标专版保留独立分支、安装标识、用户目录和发布标签；本次公开发行仅包含主线版。

## 更新内容

- 升级至官方 DSH `dsh-v0.2.2-alpha.2`，固定提交 `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`。官方内核保持原始源码，产品适配位于外部。该提交与此前指定的 `00d5414` 具有相同源码树。
- 升级并完整保留官方 Univer Office 0.3.8，包括原始 host、client、发行文件、许可和目标平台原生依赖。继续保留知识库、个人技能、专业工作台及 DSH 后台运行能力。
- 新增知识库“用户模板 DNA”：基于固定版本 Writing DNA 技能提取语言、结构、内容范围、证据、深度和格式约束。模板与材料版本一起绑定到当前会话任务，供 DSH / Codex 编写时使用；上传单个模板即可建立约束，无需将单篇范本误当成完整作者语料。
- 支持本地提取及用户主动选择配置模型的蒸馏。模型提取必须返回有原文依据的有效结果，失败或取消会如实显示；本次发布验收未新增模型请求。
- 对实际导出文件核验模板约束：检查 DOCX 样式继承及正文直接格式，给出具体不符合项；无法确定的复杂格式保留待复核提示。材料、约束或正文变化后，原核验结论失效并保留历史。
- AI 调用 Univer PDF 导出时复用产品安全通道，保留原生工具的错误、取消和任务语义。保留项目与原会话接续、工作台与主对话联动，以及按实例分配后台端口的能力。

工具链为 Node.js 24.22.1、Electron 45.0.0、electron-builder 26.18.0、Codex CLI 0.164.0。其他组件来源及验证边界见[组件清单](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.8.6/release/3.8.6-core-components.json)。

## 下载与安装

| 平台 | 安装包 |
| --- | --- |
| Windows x64 | `Agent-Pi-DSH-3.8.6-x64.exe` |
| macOS Apple Silicon | `Agent-Pi-DSH-3.8.6-mac-arm64.dmg` / `.zip` |
| macOS Intel | `Agent-Pi-DSH-3.8.6-mac-x64.dmg` / `.zip` |
| Linux x64 | `Agent-Pi-DSH-3.8.6-linux-x86_64.AppImage` / `Agent-Pi-DSH-3.8.6-linux-amd64.deb` |

各安装包均提供 SHA256。安装前保存文档并退出主线应用及托盘进程，建议使用默认目录。主线继续使用 `agent-pi-dsh-desktop` 用户目录；升级前备份重要项目。主线与投标专版请勿同时编辑同一项目文件。

macOS 两种架构均要求 macOS 15 及以上，以整包原生文件部署目标扫描为准。安装包未签名，macOS 未公证。Windows 保留原审核的内置 BIM/IFC 引擎，macOS/Linux 使用兼容的外部 IFC 引擎。

## 验证范围

Windows 候选包已完成构建回执、安装器和实际载荷核验，以及隔离启动、知识库模板上传、提取、会话绑定与持久化回读。完整 Office 已通过原生插件工具注册、DOCX 导入/导出、实际文件格式核验及受保护的 PDF 工具调用测试。平台构建另检查 DSH / Office 原生依赖、项目计划运行时、运行时来源回执及 macOS 原生部署目标。

Univer 原生打印 PDF 当前使用图像页面，不含可搜索文字层。模板约束与核验不能替代对专业事实、复杂排版和最终成果的人工审阅。未在真实用户目录执行安装、升级或卸载，未改动原项目数据；各平台 CI 验证不代表所有支持系统已完成实机安装验收。

## 源码与构建输入

应用与 Windows 构建来源固定为 [`v3.8.6` / `ba909b19d63bba4276569928f84cf209e23bb777`](https://github.com/xiangxin2021cn/agent-pi-dsh/tree/v3.8.6)。跨平台构建使用同一标签及经校验的 `runtime-payload-3.8.6.tar.gz`，不使用投标专版源码或载荷。

本次随附以下原审核对应源码，名称保留真实来源版本：

- `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`
- `Agent-Pi-DSH-3.8.2-CAD-host-corresponding-source.tar.gz`
- `Agent-Pi-DSH-3.8.0-BIM-corresponding-source.tar.gz`

[用户模板设计](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.8.6/docs/3.8.6-template-dna-design.md) · [模板验收记录](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.8.6/docs/3.8.6-template-dna-validation.md) · [官网](https://www.agent-pi.app/)。原始第三方许可和 Office 授权机制保留。

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.8.6","kernel":{"releaseTag":"dsh-v0.2.2-alpha.2","commit":"f3803c96974ad4a94195fb97e5c637e9c2a3afe3"}} -->
