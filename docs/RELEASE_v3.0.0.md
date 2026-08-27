# Agent π 3.0.0

内核换到 **DeepSeek Harness**。同样的招投标、实施、投资任务，智能体执行更利落，费用更可控。这是发动机整机更换，不是换皮。

The engine is now **DeepSeek Harness**. The same tender, delivery, and investment jobs run tighter and cost less. This is a new engine, not a reskin.

**请手动下载本安装包。** 2.6.5 不会自动更新到 3.0。经典版可以留着，也可以和 3.0 同时装。

**Download this installer yourself.** 2.6.5 will not auto-update to 3.0. Classic 2.x can stay, or sit beside 3.0.

---

## 为什么值得换 / Why switch

旧版用 Claude Agent SDK / Pi 再加上自研 SessionManager、Goal Loop 包一层。能干活，但长任务容易多绕几圈：多一次审查、多一轮空转，时间和 token 一起涨。

2.x wrapped Claude Agent SDK / Pi in a home-grown SessionManager and Goal Loop. It worked, but long jobs often took extra review turns and burned extra tokens.

3.0 把循环交给 DeepSeek Harness：工具、并行子任务、会话、权限由内核直接跑。工作台（投标 / 实施 / 投资、证据门禁、正式成果）还在，只是不再隔着一层自己的调度器。

3.0 gives the loop to DeepSeek Harness. Tools, parallel sub-tasks, sessions, and permissions run in the engine. The workbench stays — tender / delivery / investment, the evidence gate, Official Outputs — without a second scheduler in the way.

现场能感到的差别：

- 同一份招标，解析和出稿的回合更短
- 并行拆活走内核原生能力，少在控制面空转
- 同样的模型账单更省
- 打开工作区就能说任务，工作台是加速器，不是闸门
- **按企业所需创造插件**：投标 / 实施 / 投资是第一批；合同、分包、物资、尽调可以继续加。流程和插件随业务增长高度可定制，不必为新工序换产品

What you should feel:

- Fewer turns to parse a bid and produce a draft
- Parallel work uses the engine, not a second control plane
- Lower token cost on the same model
- Open a workspace and talk; the workbench accelerates, it does not gate
- **Plugins for what the enterprise needs**: tender / delivery / investment first; contracts, subcontracting, materials, diligence next. Workflows and plugins stay customizable as the business grows

---

## 企业插件 / Enterprise plugins

DeepSeek Harness 把能力做成可装配的插件和流程，而不是写死在壳子里。企业要一条新作业线，就按自己的制度、表单和验收标准做插件挂上去。业务长大，插件和流程跟着长，不用推倒重来。

DeepSeek Harness ships capabilities as plugins and workflows, not a frozen shell. A new line of work becomes a plugin that matches your rules, forms, and acceptance checks. As the business grows, plugins and workflows grow with it.

---

## 下一步 / Next

3.0 先把发动机换对。接下来会按你们在项目上的真实用法持续自改进：把反复出现的纠正、习惯和验收标准，沉淀成 **自己的经验和工作环**。让智能体越用越像你们队里的人，而不是每次从零演练。这一块指日可待。

3.0 replaces the engine first. Next we will keep improving from how you actually work: repeated corrections, habits, and acceptance checks become **your own experience and work loops**. The agent should start to feel like someone on your team, not a cold start every time. That layer is close.

---

## 安装 / Install

1. 下载下面的 `Agent-Pi-3.0.0-x64.exe`
2. 未签名：SmartScreen 选「仍要运行」
3. 装好后打开 **Agent π**，选择项目工作区
4. 配置 DeepSeek；若要看图，换自定义视觉模型并打开图片理解
5. 回形针上传资料后直接下任务

1. Download `Agent-Pi-3.0.0-x64.exe` below
2. Unsigned build: SmartScreen → Run anyway
3. Open **Agent π** and pick the project workspace
4. Connect DeepSeek; for images, use a vision model and turn image input on
5. Attach files and ask for the job

PDF 当文件读（能抽文本的不要先转图）。图片走视觉模型的正常多模态链路。

PDFs are files (readable text is not rasterized first). Images use native multimodal input on a vision model.

---

## 请先知道 / Please read

| | |
| --- | --- |
| 不会自动升级 / No auto-update | 2.x 的自动更新停在 2.6.5，避免把旧引擎静默换成新内核 |
| 会话不迁移 / Sessions stay | 旧聊天、旧模型连接不会进 3.0 |
| 项目还在 / Projects stay | 工作目录和 `Agent Pi Outputs` 可以接着用 |
| 可并存 / Side by side | 3.0 与 2.6.5 可同时安装，数据目录分开 |
| 经典版 / Classic | [v2.6.5](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

官方 DeepSeek 仍是纯文本，看不了图。需要看图时换带图片输入的视觉模型。

Official DeepSeek is still text-only. Switch to a vision-capable model when the job needs pixels.

---

## 资源 / Assets

- Windows x64：`Agent-Pi-3.0.0-x64.exe`（本版先发 Windows）
- macOS / Linux：3.0 内核运行时目前按 Windows 装配（`node.exe`、资源管理器、安装脚本）。在这台 Windows 上既不能编出可签名的 Mac 包，也不能把 Linux/mac 安装包跑起来做验收。请继续用 [v2.6.5](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) 的 dmg / AppImage。其他平台会在 runtime 按系统拆开之后单独发。
- 本 Release **不**附带 `latest.yml`。2.6.5 用户不会被自动拉到 3.0。

This release is **Windows x64 first**. macOS cannot be built from Windows. Linux/mac packages cannot be launched or signed off on this machine, and the 3.0 runtime is still assembled for Windows. Use Classic 2.6.5 for those platforms. This release does **not** ship `latest.yml`.
