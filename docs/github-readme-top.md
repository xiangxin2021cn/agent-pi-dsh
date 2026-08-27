# Agent π / Agent Pi

<p align="center">
  <img src="docs/assets/agent-pi-logo.png" alt="AIPI Always π AI Studio" width="560" />
</p>

> **Agent π 3.0 已发布：内核换到 DeepSeek Harness。**
> 执行更利落，同样的长任务更省 token。这不是一次界面改版，而是发动机整机更换。
> **请手动下载 3.0 安装包。** 2.6.5 不会自动覆盖成 3.0；经典版可继续用，也可和 3.0 同时安装。
>
> [下载 Agent π 3.0](https://github.com/xiangxin2021cn/agent-pi/releases/latest) · [留下 2.6.5 经典版](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5)
>
> **Agent π 3.0 is out: the engine is now DeepSeek Harness.**
> Agents run tighter and cost less on the same long jobs. This is a new engine, not a reskin.
> **Download 3.0 yourself.** 2.6.5 will not auto-update onto 3.0. Classic 2.x can stay installed beside it.
>
> [Download Agent π 3.0](https://github.com/xiangxin2021cn/agent-pi/releases/latest) · [Keep Classic 2.6.5](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5)

**中文** | Agent π 是面向招投标、实施交付和投资研究的 Windows 桌面智能体工作台。打开项目工作区就能干活：读资料、跑技能、出可追溯的正式成果，写回 `Agent Pi Outputs`。

**English** | Agent Pi is a Windows desktop agent workbench for tendering, project delivery, and investment research. Open a project folder and work: read sources, run skills, and write traceable deliverables back to `Agent Pi Outputs`.

3.0 把智能体循环换成 **DeepSeek Harness**。工具调用、并行子任务、会话和权限由这台内核直接驱动，不再经过旧版自研 SessionManager / Goal Loop 那一层。同样的招标解析、组价、策划，回合更短，空转更少，费用更可控。

Harness 的另一条企业能力：业务要什么，就可以按企业所需做成插件。投标、实施、投资已经是第一批；往后合同、分包、物资、财务尽调都可以继续往上加。流程和插件随业务增长高度可定制，不必为了新工序去换一套产品。

3.0 runs the agent loop on **DeepSeek Harness**. Tool calls, parallel sub-tasks, sessions, and permissions are driven by that engine — not the old in-house SessionManager / Goal Loop. The same bid parsing, pricing, and planning jobs take fewer wasted turns and cost less.

The other enterprise property of Harness: you can add plugins for what the company actually needs. Tender, delivery, and investment are the first set. Contracts, subcontracting, materials, and financial diligence can be added the same way. Workflows and plugins stay highly customizable as the business grows — you do not replace the product for every new procedure.

工作台还在：投标 / 实施 / 投资、证据门禁、正式成果目录、右侧资源文件。默认路径仍是 **选工作区，直接说任务**。工作台是加速器，不是闸门。

The workbench remains: tender / delivery / investment, the evidence gate, Official Outputs, and the files rail. The default path is still **pick a workspace and talk**. The workbench accelerates work; it does not gate it.

下一步已经对准用户现场：按你反复纠正的用法，沉淀自己的经验和工作环，让智能体越用越像你们项目上的人。这一块指日可待，会按真实需求持续自改进，而不是一次发完就停。

Next, Agent π will keep improving itself from how you actually work: your corrections become project experience and work loops, so the agent starts to feel like someone on your job. That layer is close. It will keep evolving from real use, not freeze after one release.

## Download / 下载

**当前发布版：V3.0.0**（DeepSeek Harness 内核）  
**Current release: V3.0.0** (DeepSeek Harness engine)

- 3.0 Windows x64：[Releases / latest](https://github.com/xiangxin2021cn/agent-pi/releases/latest) → `Agent-Pi-3.0.0-x64.exe`
- 2.6.5 经典版（自动更新通道停在这里；macOS / Linux 仍用这一版）：[v2.6.5](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5)

未签名安装包：Windows SmartScreen 可能拦截，选「仍要运行」。  
The installer is unsigned. If SmartScreen blocks it, choose Run anyway.

3.0 **不会**从 2.x 自动升级。旧会话和旧模型连接不会迁移；项目工作目录和 `Agent Pi Outputs` 可以接着用。

3.0 **will not** auto-update from 2.x. Old sessions and model connections do not migrate. Your project folder and `Agent Pi Outputs` still do.

## 3.0 vs 2.x

| | 2.x 经典版 / Classic | 3.0 |
| --- | --- | --- |
| 内核 / Engine | Claude Agent SDK + Pi + 自研控制面 | **DeepSeek Harness** |
| 企业扩展 / Extensibility | 改控制面才能加流程 | 按企业所需做插件；流程随业务增长可高度定制 |
| 长任务 / Long jobs | Goal Loop 审查回合 | 内核原生 subagent / workflow，少绕一层 |
| 费用 / Cost | 控制面和循环更容易空转 | 同样活，回合更短，token 更省 |
| 图片 / Images | 先识图再塞进对话 | 视觉模型走原生多模态；PDF 当文件读 |
| 数据目录 / Data | `~/.agent-pi` | `%APPDATA%\agent-pi-dsh-desktop` |
| 更新 / Updates | GitHub 自动更新到 2.6.5 | 先手动下载 3.0 |

## Enterprise plugins / 企业插件

Harness 不是把流程焊死在桌面里。企业缺哪一段作业，就按自己的制度做成插件：技能、工具、工作台页、验收门禁都可以加。投标三件套只是第一批；后面的工序用同一套装配方式往上叠。

Harness does not weld one workflow into the desktop. Missing procedures become plugins — skills, tools, workbench views, and gates — fitted to the company’s own rules. The tender suite is the first set; later procedures stack on the same assembly.

## Getting started / 上手

1. 安装 3.0，打开 **Agent π**。
2. 选择项目工作区（投标资料所在目录）。
3. 配置 DeepSeek 或自定义视觉模型。官方 DeepSeek 是纯文本，看图请换视觉模型。
4. 回形针上传文件。PDF 按文件解析；图片按多模态发送。
5. 直接下任务：解析招标、对 BOQ、做策划、写正式成果。

1. Install 3.0 and open **Agent π**.
2. Pick the project workspace (the folder with the bid files).
3. Connect DeepSeek or a vision-capable custom model. Official DeepSeek is text-only.
4. Attach files. PDFs are files; images go through native multimodal input.
5. Ask for the job: parse the tender, reconcile the BOQ, plan the works, write Official Outputs.
