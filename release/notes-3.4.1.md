# Agent Pi DSH 3.4.1 — DSH alpha.1 兼容与投标工作台收敛

本版正式迁移到 **DeepSeek Harness `0.1.2-alpha.1`**，同时收敛投标工作台的自动推进边界、审批门禁、BOQ 溯源和前端模块结构。DSH 官方子模块保持字节干净，Agent Pi 的兼容能力均由产品层启动迁移和运行时 overlay 提供。

## DSH alpha.1 兼容

- 修复桌面端认证启动、四种官方 Agent 模式和新版会话恢复流程。
- 旧会话若仍保存 `agentPreset: code`，首次启动会可恢复地迁移到 `standard`；只替换独立会话头，后续事件帧保持不变。
- 产品级 `standard`、`ptc`、`minimal`、`cordis` preset overlay 不再修改 DSH 官方源码。
- Univer 插件适配 alpha.1 会话服务；右侧文件栏恢复并保留折叠、宽度和文件类型图标。
- `@xmanrui/dsh-im` v4 改用 Typert Gateway 新路径，市场状态明确显示“兼容 / 不兼容 / 待重启”。

## 投标工作台

- 流程收敛为七个阶段：项目登记、投标决策、招标分析与 BOQ、价格基准、详细组价、施工技术方案、合规与提交冻结。
- 投标决策、价格基准和最终提交由用户显式确认；没有已提交事务时不再自动推进。
- 每会话事务控制器统一处理准备、提交、成功、失败和会话销毁，避免跨会话串单及崩溃恢复误触发。
- 保留 `tender-host` 持久化状态、BOQ 全量清点、来源溯源和核心门禁。
- 五份重复长报告收敛为结构化分析底稿及按需视图；审查以风险、变更和抽样为主。
- `tender-web` 从单体客户端拆为可测试源模块，再生成兼容 DSH 的单文件 bundle。
- 移除投标插件重复 API Key 弹窗，模型凭据继续由 DSH 官方模型设置统一管理。

## Codex、上下文与安装

- 保留 DSH 主智能体 + Codex 子智能体，主对话可显式指定 Codex 执行。
- 保留模型容量来源解析、72% 自动压缩和可选 DeepSeek V4 Flash Vision 摘要兜底。
- Windows 安装程序使用 Agent Pi Logo，完成页默认勾选启动应用。
- 打包后的 Electron 成品已验证旧默认值迁移、旧会话迁移、事件帧保持和标准 → PTC → 极简模式切换。

## 验证

- 产品层 71 个测试文件、372 项测试全部通过。
- Windows x64 安装包 SHA256：`6ED547C90385F79443CDD78C6B25D7D366BFA5E0C3462685570F9C510F619086`。
- DeepSeek Harness 官方子模块保持干净。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.4.1-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.1/Agent-Pi-DSH-3.4.1-x64.exe) · SHA256 `6ED547C90385F79443CDD78C6B25D7D366BFA5E0C3462685570F9C510F619086` |
| macOS Apple Silicon | [DMG](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.1/Agent-Pi-DSH-3.4.1-mac-arm64.dmg) · [ZIP](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.1/Agent-Pi-DSH-3.4.1-mac-arm64.zip) |
| Linux x64 | [AppImage](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.1/Agent-Pi-DSH-3.4.1-linux-x86_64.AppImage) · [DEB](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.1/Agent-Pi-DSH-3.4.1-linux-amd64.deb) |
| 保留的 3.3.6 | [Agent Pi DSH v3.3.6](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/tag/v3.3.6) |
| 2.6.5 经典版 | [Craft Agents OSS 版](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

桌面安装包尚未签名。覆盖安装前请完全退出 Agent Pi DSH，包括托盘进程；Windows 遇到 SmartScreen 时选择「仍要运行」。
