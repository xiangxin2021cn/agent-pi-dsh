# Agent Pi DSH 3.3.6 — Codex 事务执行、模型容量与自动压缩

本版延续 **`dsh-v0.1.1-rc.2`** 稳定内核。DSH `0.1.2-alpha.1` 的大版本迁移将在独立 3.4.0 分支进行，不混入本次发布。

## 主要变化

- 主对话可将当前一轮显式交给 `subagent_codex`；DSH 主智能体继续负责投标流程、知识库和验收。
- 每会话独立事务控制器统一处理准备、提交、成功、失败和销毁，不跨会话串单。
- Codex 结算同时核对 Host 与公开会话状态，本地发送失败、拒绝和中断均明确收口。
- 设置页显示当前 Codex 模型和上下文容量。
- DeepSeek/pi-ai 模型容量按用户配置、供应商发现、目录和估算逐字段解析并记录来源。
- 对话约 72% 上下文占用时自动压缩；当前模型失败时可选 DeepSeek V4 Flash Vision 摘要兜底。
- Windows 安装完成页默认勾选“运行 Agent Pi DSH”，用户可取消。
- Windows 打包固定使用本地 Electron 工具链，DSH 补丁兼容 CRLF 并保持幂等。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.3.6-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-x64.exe) · SHA256 `5CD82E6E4769387059F3CDC2E5FFBA0496187FB6BEB40CE65E6439F506AD56F5` |
| macOS Apple Silicon | [DMG](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-mac-arm64.dmg) · [ZIP](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-mac-arm64.zip) |
| Linux x64 | [AppImage](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-linux-x86_64.AppImage) · [DEB](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.6/Agent-Pi-DSH-3.3.6-linux-amd64.deb) |
| 保留的 3.3.5 | [Agent Pi DSH v3.3.5](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/tag/v3.3.5) |
| 2.6.5 经典版 | [Craft Agents OSS 版](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

Windows 安装包未签名；SmartScreen 拦截时选择「仍要运行」。覆盖安装前请完全退出 Agent Pi DSH，包括托盘进程。
