# Agent π 3.1.0 — 换心之后，第一次体系化进化

3.0 把发动机换成了 **DeepSeek Harness**。3.1 是新发动机上的第一次整车重构：专业工作台从「能干活」进化为「像一支受过训练的队伍」——经验能沉淀、证据能追溯、阶段能收口、质量能裁决。

3.0 swapped the engine to **DeepSeek Harness**. 3.1 is the first full rebuild on top of it: the workbench now accumulates experience, traces evidence, gates stage completion, and adjudicates quality — less like a tool, more like a trained crew.

---

## 一句话，把这单活变成下一单的生产线 / One sentence turns this job into a production line

做完一单活（比如一份符合南非标准的 Method Statement），对它说：

> 把我们最后的成果和过程整理一下，生成该领域的专业工作台模块。

智能体会复盘整场对话：方法提炼成技能，成果样例存入知识库，流程固化为阶段模块。下次同类任务，直接建项目开跑。专业分类不再由软件预设，而是从你的实际工作里长出来——投标、实施、投资只是第一批，你的每个业务线都能自己长成模块。

Finish a job, then say one sentence: "distill what we did into a workbench module for this domain." The agent reviews the whole conversation — methods become skills, deliverables become knowledge-base exemplars, the process becomes a staged module. Next time, open a project and run. Your business lines grow their own modules.

## 本地知识库 / Local knowledge base

上传规范、范文、合同模板（PDF 等）即可入库：可检索、可引用、可增删、可管理。写作时智能体按库出证据，缺原文就明说缺口，不用模型记忆填空。

Upload standards, exemplars, contract templates; the local knowledge base indexes them for retrieval and citation. Writing cites the library — gaps are declared, never hallucinated.

## 统一成果树与阶段总报告 / One output tree, mandatory stage reports

- 全部阶段成果统一归位 `Agent Pi Outputs/<项目>/<阶段>/`，后续阶段按固定路径读取，不再满盘找文件
- 解析成果强制按上传文件名命名：`N.003-010-2017-3R Book 1 of Volume 3.pdf` 的解析稿就叫 `N.003-010-2017-3R Book 1 of Volume 3.md`
- 解析阶段硬性交付《招标文件解析总报告》：项目特征、规范体系、合同版本与修订、评分办法一网打尽；BOQ 阶段硬性交付《BOQ 组价总报告》。总报告缺失，阶段收不了口
- 临时中间文件不再混入正式成果

Outputs live under one predictable tree, deliverables are named after their source files, and each stage must produce its synthesis report (tender-parse master report, BOQ pricing master report) before it can close.

## 掌控型质检 / Supervisory quality control

- **检查 = 全面体检**：逐阶段对账任务、产物、引用链、门禁，问题行直接标红
- **成果质检并整理**不再机械重扫：自动把散落文件改名归位，逐项裁决缺口（补做 / 返工 / 纠状态），稽核评审轮次——每份成果最多 2 轮修订 + 1 次终审，超轮次立即上报用户裁决
- 成果中的引用令牌可点击溯源原文，孤儿引用可审计

"Check" now audits every stage against the disk — tasks, artifacts, citations, gates. "Inspect & organize" renames strays, adjudicates gaps, and enforces review discipline (max 2 revisions + 1 final review per deliverable). Citation tokens are clickable and auditable.

## 深推理协议上车 / Deep-reasoning protocol on board

装载 **J-Space 认知控制套件**（社区对 DeepSeek 长程推理的强化协议）：全卷标书解析、跨册对账、BOQ 组价这类长难任务自动启用推理门禁——防漂移、防捷径、强制自验。简单对话零开销，复杂任务才加载。

The J-Space cognition suite (a community protocol hardening DeepSeek's long-horizon reasoning) loads on demand for heavy jobs — anti-drift, anti-shortcut, mandatory self-verification — at zero cost to everyday chats.

## 稳定性 / Stability

- 修复主会话派发子会话时的程序崩溃
- 修复引用原文预览关闭后误退出全文阅读的问题
- 修复部分成果散落项目根目录、临时文件被当成正式成果发布的问题

Fixed the crash when dispatching sub-sessions, the citation-preview back-navigation bug, and stray/scratch files leaking into official outputs.

---

## 平台 / Platforms

| 平台 | 资产 | 说明 |
| --- | --- | --- |
| Windows x64 | `Agent-Pi-DSH-3.1.0-x64.exe` | 未签名：SmartScreen 选「仍要运行」 |
| macOS (Apple Silicon) | `Agent-Pi-DSH-3.1.0-mac-arm64.dmg` / `.zip` | CI 自动构建；未签名：右键 → 打开（或 `xattr -cr /Applications/Agent\ Pi\ DSH.app`） |
| Linux x64 | `Agent-Pi-DSH-3.1.0-linux-x86_64.AppImage` / `-amd64.deb` | CI 自动构建；AppImage 先 `chmod +x` 再运行 |

`runtime-payload-3.1.0.tar.gz` 是 CI 构建原料（平台无关运行时），普通用户无需下载。

macOS / Linux assets are built automatically by GitHub Actions from the runtime payload attached to this release — the first cross-platform pipeline for the 3.x line. Unsigned builds: right-click → Open on macOS.

## 升级 / Upgrade

- 3.0 → 3.1 直接安装，项目与数据目录不动
- 2.x 经典版可继续并存；经典版留在 [v2.6.5](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5)
- 官方 DeepSeek 仍是纯文本模型；需要看图时在设置里换视觉模型

Install over 3.0 — projects and data stay. Classic 2.x can sit beside it.
