# Agent Pi DSH 3.3.5 — 投标执行链、Codex 登录与仓库边界收紧

**3.3.5** 是 DSH 版，不是 2.6.5 经典版。本版把 DSH 源码与 Craft Agents OSS 经典版正式分库，集中修复投标模块的阶段推进、BOQ 覆盖、能力包状态和父会话接续问题，并增加无需 API Key 的 ChatGPT/Codex 登录与 Codex 子智能体。内核继续钉在 **`dsh-v0.1.1-rc.2`**。

## 两个仓库

- DSH 3.x：<https://github.com/xiangxin2021cn/agent-pi-dsh>
- Craft Agents OSS 2.x：<https://github.com/xiangxin2021cn/agent-pi>

两个版本的源码、Release 和应用内更新通道相互独立。2.6.5 仅代表经典版。

DSH 内核固定在官方 `b150a551b8`，Agent Pi 必需的宿主与会话修复作为可重复应用的补丁随本仓库发布，克隆源码不会丢失本版已经验证的内核差异。

## 投标模块修复

- 阶段必须按顺序推进；磁盘出现成果文件不会再偷偷把阶段标成完成。
- 规划与递交阶段先检查能力包是否真实 `ready`，再核对技能声明的全部硬交付物。
- 招标文件解析必须登记 BOQ，并有可追溯的恢复解析稿；BOQ pack 不能只放示例或占位行。
- BOQ 覆盖按恢复后的源表全量核对，包括省略重复主编号的字母子项；只抽三行不能掩盖源表剩余项目。
- 能力包的就绪结果确定性写回索引；核心项目资料修订后，下游旧包会标记为 stale。
- 工作台直接显示 BOQ 缺口；本阶段选中的知识库条目写入各源文件工人 brief，要求通过 `kb_search` / `kb_read_chunk` 使用。
- 子代理回推或用户在父任务等待时追加消息，会唤醒父会话继续核验和收口；队列中的消息不再被误当成仍在运行。
- 工作台从任意层级子会话发起阶段任务时，统一路由到根主会话，知识库选择和成果回推不再落入子会话孤岛。
- 监控面板显示主会话与嵌套子智能体的实时执行状态；任一子智能体仍在运行时不会重复自动推进，完成、停止、失败和拒绝等回推都会唤醒主会话收口。

## ChatGPT / Codex 子智能体

- 设置新增“Codex 智能体”：登录、状态验证、刷新和注销均走桌面安全桥。
- Codex 设置项不再依赖桌面桥接的瞬时加载顺序；即使运行时异常也会显示明确状态，不再从设置侧栏静默消失。Codex 仍是子智能体，不会出现在“模型”提供方列表。
- 使用官方 Codex 浏览器登录，无需 API Key；凭据只保存在 Agent Pi 专属本机目录，不进入网页层。
- DeepSeek DSH 继续担任主智能体和投标流程控制器；Codex 通过 `subagent_codex` 接收独立 brief。
- `code`、`standard`、`cordis`、`router-standard` 四套 Preset 均启用 Codex 工具，默认采用 `workspace-write + auto_review`，不绕过 sandbox。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.3.5-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.5/Agent-Pi-DSH-3.3.5-x64.exe) |
| macOS Apple Silicon | [DMG](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.5/Agent-Pi-DSH-3.3.5-mac-arm64.dmg) · [ZIP](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.5/Agent-Pi-DSH-3.3.5-mac-arm64.zip) |
| Linux x64 | [AppImage](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.5/Agent-Pi-DSH-3.3.5-linux-x86_64.AppImage) · [DEB](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.3.5/Agent-Pi-DSH-3.3.5-linux-amd64.deb) |
| 2.6.5 经典版 | [Craft Agents OSS 版](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

桌面安装包尚未签名。覆盖安装前请完全退出 Agent Pi DSH，包括托盘进程；Windows 遇到 SmartScreen 时选择「仍要运行」。
