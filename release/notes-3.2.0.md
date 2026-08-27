# Agent π 3.2.0 — 内核升到 rc.7，长任务能收口

3.0 换发动机，3.1 把工作台练成队伍。**3.2.0** 把钉住的 DeepSeek Harness 从 `0.1.0-rc.5` 升到 **`v0.1.0-rc.7`**，并按现场用法收了两件长任务的口：崩溃后不要把已完工工人再扫一遍；正文里的引用只标出处，不贴原文。

3.0 replaced the engine. 3.1 trained the crew. **3.2.0** pins DeepSeek Harness **`v0.1.0-rc.7`** and closes two field gaps: after a crash, do not rescan finished workers; citations locate the source instead of dumping it into the draft.

---

## 内核 `0.1.0-rc.5` → `0.1.0-rc.7`

钉住上游 `v0.1.0-rc.7`（`99f6f02fec`，2026-08-17）。本地曾改的持久 Bash `PS1='dsh> '` 不再需要：上游已用受控提示符修好，且更稳。

- **持久 Bash 不再卡 3 秒多才出字**：工具初始化只发 `stty -echo`，后端每次用 `PROMPT_COMMAND` 重申受控提示符。投标场景里大量 shell 调用会明显变快。
- **设置页可由插件自己注册卡片**：dshmarket、vision-router 一类不再卡在旧的 settings 槽位协议上。`settings.plugin.item` 从列表槽改成按命名空间 keyed，卡片必须带 `key`。本版已给钉住的 `dsh-vision-router` 1.4.4 补上 `key: 'vision-router'`，否则启动会直接报 Failed to load plugins。
- **右侧「资源文件」栏**：挂在根 overlay 上，rc.7 会话行经常还没带 `cwd`。现按当前会话在工作区登记里的路径补齐；有会话就画栏，不再整栏消失。顶栏文件夹按钮改回打开这一栏。
- **图片附件走持久化**：MCP/ACP 可带图；PTC Mode（原 Code mode）能转发嵌套图片。
- **推理强度新增 `low`**：默认仍是 `high`，需要省成本时可以调低。
- **Job Panel 能看到 Codex / Claude Code 一类后台子代理任务**。
- **大历史分页不再栈溢出**（#1371）：上游不再对 provenance 做 variadic `Math.min`。Safari 输入框错位、max-tokens 截断后续跑、pwsh-terminal overlay 重复加载也一并修了。
- **提问卡片可折叠并保留草稿**；Cordis 动态插件面板更好用。

Persistent Bash no longer stalls several seconds per call. Plugin settings cards, durable image attachments, optional `low` reasoning, Job Panel visibility, and large-history pagination land with the kernel. The old local Bash `PS1` patch is gone — upstream replaced it.

---

## 崩溃只救没递交的工人 / Recover undelivered work only

工人正常写完并回推，父会话照常处理——正常下派不加额外规矩。父会话崩了、断线、或你把应用重启之后：

- **已经落到 Official Outputs 的任务不再重读 JSON、不再重派、不再重解析源文件**
- 只找回还没递交成果的工人：能续跑就续跑，续不上再下派这一条
- 阶段状态查询只给未完成清单，不再把整盘快照倒进上下文
- 不会把整个阶段当新任务重开
- 你在正式稿上改的字留在父会话里，不会把已完工工人叫醒

A live completion is handled normally. After a parent crash or restart, done tasks stay done. Only workers that never delivered Official Output are resumed. `tender_stage status` returns the pending checklist, not a full workbench dump.

---

## 引用是出处芯片 / Citations are locators

Markdown 里的引用令牌显示成短芯片。点一下只看到 **源文件、页或行、题目或段落**，需要时再打开源文件。写作合同禁止把证据正文贴进稿里——芯片是标注，原文在库里。

Citation chips show file, page or lines, and heading. They do not paste the source chunk into the draft.

---

## 仍必须保留的 Agent Pi 覆盖层 / Overlays kept

上游 `subagent.history` 仍会走 `catalogChild` / `listChildren`。打开带上百个工人的父会话时，冷/热孩子历史仍会堵事件循环。3.1.2 / 3.1.3 的目录跳过必须留下。

上游 `paginate` 仍会整份复制 live log。3.1.3 的事件上限、字符串瘦身、JSON 预算、以及不复制内存日志也必须留下。审批回执仍在本轮立刻接受，失败可重试。

The 3.1.x history and approval overlays remain. Opening one child's history must not freeze the window; the directory menu may still be slow because `subagent.list` still walks siblings.

---

## 下载 / Download

| 平台 | 资产 | 说明 |
| --- | --- | --- |
| Windows x64 | `Agent-Pi-DSH-3.2.0-x64.exe` | 未签名：SmartScreen 选「仍要运行」 |

macOS / Linux 仍用 CI 在发布后构建；本包先发 Windows。

升级后请完全退出再打开（不要只关到托盘）。打开带上百个子代理的父会话时，目录菜单仍可能慢；点开某一个孩子的历史不应再把整窗打死。已完工的工人崩溃后不应被重新派一遍。
