# Agent Pi DSH 3.7.5

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.7.5","kernel":{"releaseTag":"dsh-v0.1.7-rc.2","commit":"477b4f420553e8a52c2fbccc464d7561b239c443"}} -->

本版新增以客户当次目标为依据的专业任务引导。DSH 内核保持官方 **0.1.7-rc.2**；执行、工作流和权限继续使用原生机制。

- 主对话区的“本次任务”页签集中记录目标、范围、语言、国别、合同及计量依据、待确认问题、计划、来源和成果检查。任务按会话保存，条件变化令受影响的计算和文件待复核。
- 新增 Cordis 任务及能力服务，统一读取实际工具、技能、专业插件和用户工作台；评估缺失工具、适用条件及补足方式。普通任务无需先创建工作台项目。
- 投标按全文覆盖、项目属地尽调、BOQ 成本与资源逐项推导、实施策划及实际递交文件推进。国别规则按项目适用依据选择，中国、纳米比亚等项目不再无条件套用南非范例。公共尽调尊重用户联网设置。
- 新增确定性 BOQ 资源/成本、工效消耗及排程资源峰值计算；记录来源、推导和假设。招标要求关联实际表单和文件，签署及客户验收由用户确认。
- 施工图、工程量、施工方案和通用企业文档、表格、调研、汇报按当次范围引导。自动应用专业写作要求，并检查实际文件、套话、重复内容和专业复核状态。
- 升级 Codex CLI 0.157.1、Electron 44.4.5、插件市场 1.66.2、PDF.js 6.3.289、Canvas 1.0.9、Marked 18.0.14 等依赖；完整 Office、CAD、项目计划预览和客户配置保留。

全文文本抽取不等于扫描页、表图和附件已完成专业复核。系统未预装全球全部规范；未核实条件保留缺口或情景。写作自动检查属于辅助检查，正式提交仍需专业复核和实际签署。AnySearch 0.1.6 在当前内核上继续遵守官方兼容检查；不可用时使用原生网络工具，不绕过校验。

升级前完全退出 Agent Pi DSH。下载及 SHA256 见本页资产；Windows 安装包未签名。本产品由 **Always π AI studio** 独立开发，发行许可为 **GPL-3.0-only**，沿用可核验的 CAD 对应源码归档。

实施及验证：[实施计划](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.7.5/docs/implementation-plan-3.7.5.md) · [验证记录](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.7.5/docs/verification-3.7.5.md) · [依赖审计](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.7.5/docs/dependency-audit-3.7.5.json) · [专业任务引导](https://github.com/xiangxin2021cn/agent-pi-dsh/blob/v3.7.5/docs/professional-task-guide.md)

## 下载

| 平台 | 安装包 | SHA256 |
|---|---|---|
| Windows x64 | [下载](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-x64.exe) | [校验文件](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-x64.exe.sha256) |
| macOS Apple Silicon | [下载](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-mac-arm64.dmg) | [校验文件](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-mac-arm64.dmg.sha256) |
| macOS Apple Silicon ZIP | [下载](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-mac-arm64.zip) | [校验文件](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-mac-arm64.zip.sha256) |
| Linux x86_64 AppImage | [下载](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-linux-x86_64.AppImage) | [校验文件](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-linux-x86_64.AppImage.sha256) |
| Linux amd64 Debian/Ubuntu | [下载](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-linux-amd64.deb) | [校验文件](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.7.5/Agent-Pi-DSH-3.7.5-linux-amd64.deb.sha256) |

本版沿用已验证的 CAD 构建和对应源码，故 CAD 源码资产保留 3.6.2 名称。Windows 构建记录、跨平台运行时载荷及各自校验文件随同提供。

已执行本地回归：主机/客户端/专业任务 509 项、业务核心 125 项、配置兼容 18 项、版本/市场/CAD/项目计划 57 项；主对话任务页的中英文、窄屏、保存与重载已验证。真实客户投标项目的专业验收须另行完成。
