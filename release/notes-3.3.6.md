# Agent Pi DSH 3.3.6 — Codex 事务执行、模型容量与自动压缩

**3.3.6** 延续 `dsh-v0.1.1-rc.2` 稳定内核，集中发布 3.3.5 之后完成的 Codex 主对话指派、每会话事务控制、模型容量解析和自动上下文压缩。DSH `0.1.2-alpha.1` 的体系迁移不混入本版，将在独立的 3.4.0 分支开发。

## 主对话指定 Codex 执行

- 主对话可把当前一轮显式交给 `subagent_codex`，DSH 主智能体仍掌握投标流程、知识库和验收。
- 每个会话使用独立事务控制器，统一管理准备、提交、成功、失败和会话销毁；不同会话不会串单。
- Codex 结果只有在 Host 和公开会话状态确认结算后才进入成功态，本地发送失败、子智能体拒绝或中断会明确失败。
- 设置页显示当前登录模型和上下文容量，Codex 运行时异常不再让设置入口静默消失。

## 模型容量与自动压缩

- DeepSeek 和 pi-ai 路由按用户配置、供应商发现、已安装目录与保守估算逐字段解析 `contextWindow` / `maxTokens`，并保留来源标记。
- DeepSeek V4 系列按官方 1M 上下文、最大 384K 输出作为内置容量基线；用户明确配置始终优先。
- 对话接近 72% 上下文占用时自动压缩，先使用当前会话模型。
- 当前模型摘要发生符合条件的失败时，可用 `deepseek-v4-flash-vision-exp` 摘要旧对话兜底；设置页明确提示额外费用和跨供应商处理边界，也可关闭该兜底。

## Windows 打包与安装

- Windows 打包固定使用项目本地 Electron 工具链，避免全局 npm/npx 污染。
- DSH 补丁识别兼容 CRLF，重复准备运行时保持幂等。
- 安装完成页新增“运行 Agent Pi DSH”复选框，默认勾选；点击“完成”关闭安装器后启动应用。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.3.6-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-x64.exe) · SHA256 `5CD82E6E4769387059F3CDC2E5FFBA0496187FB6BEB40CE65E6439F506AD56F5` |
| macOS Apple Silicon | [DMG](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-mac-arm64.dmg) · [ZIP](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-mac-arm64.zip) |
| Linux x64 | [AppImage](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-linux-x86_64.AppImage) · [DEB](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-linux-amd64.deb) |
| 保留的 3.3.5 | [Agent Pi DSH v3.3.5](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/tag/v3.3.5) |
| 2.6.5 经典版 | [Craft Agents OSS 版](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

桌面安装包尚未签名。覆盖安装前请完全退出 Agent Pi DSH，包括托盘进程；Windows 遇到 SmartScreen 时选择「仍要运行」。
