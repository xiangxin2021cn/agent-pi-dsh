# Agent Pi DSH 3.3.5 — 投标执行链、Codex 登录与仓库边界收紧

**3.3.5** 是 DSH 版，不是 2.6.5 经典版。本版正式分离 DSH 与 Craft Agents OSS 仓库，修复投标执行链，并增加无需 API Key 的 ChatGPT/Codex 登录和 `subagent_codex` 子智能体。内核继续钉在 **`dsh-v0.1.1-rc.2`**。

## 两个仓库

- DSH 3.x：<https://github.com/xiangxin2021cn/agent-pi-dsh>
- Craft Agents OSS 2.x：<https://github.com/xiangxin2021cn/agent-pi>

两个版本的源码、Release 和应用内更新通道相互独立。2.6.5 仅代表经典版。

DSH 内核固定在官方 `b150a551b8`，Agent Pi 必需的宿主与会话修复作为可重复应用的补丁随本仓库发布，克隆源码不会丢失本版已经验证的内核差异。

## 修复

- 阶段必须按顺序推进；磁盘成果不会隐式完成阶段。
- 规划与递交先核能力包 `ready` 状态，再核全部硬交付物。
- 招标解析必须登记并恢复真实 BOQ，按源表全量核对；示例行、占位行、只抽三行均不能过关。
- 能力包状态确定性写回；核心资料修订后，下游旧包标记 stale。
- 工作台显示 BOQ 缺口，选中的知识库条目进入源文件工人 brief。
- 子代理回推或用户追加消息会唤醒父会话继续核验收口。

## Codex 智能体

- 设置页直接完成 ChatGPT 登录、状态验证与注销，无需 API Key。
- 凭据保存在 Agent Pi 专属本机目录，不进入网页层。
- DSH 仍是主智能体；Codex 只通过 `subagent_codex` 接收独立任务。
- 四套桌面 Preset 均启用 Codex，使用 `workspace-write + auto_review`，不绕过 sandbox。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.3.5-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.5/Agent-Pi-DSH-3.3.5-x64.exe) |
| 2.6.5 经典版 | [Craft Agents OSS 版](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

Windows 安装包未签名；SmartScreen 拦截时选择「仍要运行」。覆盖安装前请完全退出 Agent Pi DSH，包括托盘进程。
