# Agent Pi DSH 3.3.3 — 南非道路投标分析更深，右侧多格式，软件内 Univer 编辑

**3.3.3** 把日常好用再往前推了一步：南非道路投标的招标解析必须写到规定深度，不能再拿一份总报告交差；右侧资源栏能按真实格式打开、预览、改稿；Excel / Word / PPT 引入 **Univer**，在软件里直接编辑保存。同一版把活工人上限钉在 4，宿主崩溃后续跑指令打回当前主对话。内核仍钉在 DeepSeek Harness **`dsh-v0.1.1-rc.2`**。没有新的会话库格式断裂。

对外下载见 [GitHub Release v3.3.3](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v3.3.3)。知识库行为以 [notes-3.3.2.md](./notes-3.3.2.md) 为准。

---

## 这版你先测什么 / What to test first

覆盖安装**不改** `%APPDATA%\agent-pi-dsh-desktop\dsh-home` 里已有知识库。请**完全退出**再装（关掉托盘）。未签名：SmartScreen 选「仍要运行」。

1. 开一轮投标分析或组价：同时活着的子智能体应不超过 **4**。任务稿和系统提示都写「同时最多 4 个活工人」。已有 profile 若把 `maxParallelToolCalls` 写得更大，下次组装会压回 4。
2. 人为结束宿主或等一次 OOM 重启后，主会话空闲时应自动出现续跑指令（不要另开窗口）。同一崩溃标记只发一次。
3. 右侧「资源文件」里 `.md` / `.xlsx` / `.docx` / `.pptx` / `.pdf` / `.html` 应是**分色实心底标**（青色 M、Excel 绿带头栏网格、蓝 W、橙播放、红 P、紫括号），不再全是同一张折角纸。
4. 左侧会话栏右缘、右侧资源栏左缘都有一条可拖握条。右侧宽度会记到 `localStorage`（220–560px）。左侧用官方拖条（约 264–420px），这版把隐形条改成可见并抬到工作台之上。
5. 打开 Markdown：应先进**只读预览**，工具栏有「编辑」。点「编辑」才进所见即所得，再点变回「预览」。点「源码」才切 textarea。超大稿仍只渲染前 6 万字、每表前 80 行；保存时把未显示的表行和后半段拼回原文件。关掉再点下一份，不应再卡死到「预览生成失败」。
6. 预览 Markdown / 文本 / Word / 表格时选中一段，或点工具栏 **AI 改**：弹出 **AI 改选区**。写下指令后「发给主对话」，主会话应带着项目记忆去改这个文件，不要另开独立 rewrite。
7. 打开生成的 `index.html`：相对 CSS/JS 应能加载，脚本可跑。右侧点 `.xlsx` / `.csv` / `.tsv` / `.docx` / `.pptx` / `.univer`：有官方 Univer 插件时应直接出现**对话同一套完全体**，不是精简格子/段落/文本框。首次打开会导入工作区隐藏 sidecar（`.agent-pi/univer-preview/`），可能要等 Gateway 起来。官方没挂上才回退精简预览。旧 `.xls` / `.doc` / `.ppt` 不能导入，提示另存为 xlsx/docx/pptx。
8. 招标解析阶段：只有逐文件稿、没有五份深度稿时，「检查」应标红并列出缺哪一份；点继续推进 / 监控空闲应只催补齐这五份，不要整单重扫。`complete_stage` 在套件未齐时应被拒绝。

Windows 安装包：[`Agent-Pi-DSH-3.3.3-x64.exe`](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-x64.exe)。macOS arm64 / Linux x64 由同一 Release 上的 CI 回传。

---

## 限流并行 / Live worker cap

现场日志里不是南非网络超时，而是单进程堆到约 8GB 后 `FATAL ERROR: JavaScript heap out of memory`，退出码 134 / `0xC0000409`。默认 DSH `maxParallelToolCalls` 是 10，模型还曾一次扇出 17 个活工人。

这版把产品上限钉在 **4**：

- 组装 tender profile 时写入 `agent-loop.maxParallelToolCalls: 4`
- 已有 overlay 没有该键就补上；大于 4 压回 4
- 分析 / 组价 / 实施 / 投资任务稿和系统提示都写「同时最多 4 个活工人」
- **不要**再把 `--max-old-space-size` 往 16GB 机器上加。限流才是根因处理。

---

## 崩溃后自动续跑 / Crash resume on the parent session

官方冷修会写 `TOOL_OUTCOME_UNKNOWN`，模型按官方文案不会盲目重试。产品侧在宿主退出后写 `$DSH_HOME/host-restart.json`（OOM / abort 会标出来）。Web 端每 4 秒看一次：主会话空闲、有历史、该次崩溃还没 ack，就把续跑指令 `prompt` 进**当前主会话**，再 ack。去重键是 `sessionStorage` 里的 `ap-crash-resume-<at>`。

桌面壳先写 `[exit]` 和 `[restart]`，再关启动日志流，避免重启标记丢在 `end()` 之后。

---

## 右侧文件图标 / File icons

上一轮描边折角纸在 16px 上看不出差别。这版改成 Office 式实心底标：`.md` 青色 M，`.xls` / `.xlsx` / `.csv` Excel 绿（`#217346`）带头栏的网格，`.doc` / `.docx` 蓝色 W，`.ppt` / `.pptx` 橙色播放三角，`.pdf` 红色 P，`.html` 紫色尖括号，图片青、JSON 琥珀括号。文件夹仍是文件夹。

---

## 左右栏宽度 / Resizable rails

左侧官方 AppFrame 本来就能拖（264–420px），但握条是隐形的，工作台打开时还被 overlay 盖住。这版给 `[data-side=sidebar]` 加上可见握条并抬到 z-index 40。右侧资源栏左缘可拖 220–560px，宽度写入 `localStorage` 的 `ap-files-width`，对话和工作台用 `--ap-files-w` 让位。收起仍是 56px。

---

## 超大 Markdown / Heavy preview

老 Agent Pi 稳，是因为它打开 Markdown 就是所见即所得，并且不在打开时把整表填完。这版对齐这两条：

- 打开 `.md` / 知识库解析稿默认进只读预览，工具栏「编辑」才进所见即所得；源码只是手动切换
- 大表不再自动把编辑器打成 textarea（以前 `previewIsHeavy` 会强制源码）
- 超过约 8 万字或 150 表行算重文档
- **任何** `mdToHtml` 都先切前 6 万字（按行界），避免主线程卡死成「预览生成失败」
- 每张 pipe / MinerU HTML 表先画 80 行；保存所见即所得时把隐藏行从原文拼回去
- 打开预览**不再** `requestAnimationFrame` 自动填完全文
- 内容请求 45 秒超时并可用 AbortController 取消；切文件会取消上一份
- 最近 8 个预览结果进内存缓存，关掉再打开同一份不必重下
- 单独一行 `| … |`（没有下一行 `---` 分隔符）不再让 `mdToHtml` 死循环；界面因此会一直停在「正在打开文件…」。组价稿里表后空一行再写 `| **合计** |` 就会踩中

---

## 预览选区回主对话 / AI edit selection

老设计是独立「AI edit selection」模态，跟主会话无关，没有项目记忆。这版模态还在（标题 **AI 改选区**），但「发给主对话」走 `dispatchToConversation`：先回形针注入该文件，再把选区和指令写进当前会话。Esc 先关模态，再关预览。

Markdown / 文本 / Word / 表格 / 幻灯片预览里划选即可弹出；工具栏也有 **AI 改**，没选中时带上当前可见摘录。HTML / PDF iframe 里划不到字时，用工具栏按钮带文件摘录或空提示。

---

## 文件预览格式 / Preview formats

对齐老 Agent Pi 的常用格式，并补 Office / HTML：

| 种类 | 预览 | 编辑保存 |
| --- | --- | --- |
| PDF | 内嵌阅读 | 下载原件 |
| Markdown / 文本 | 打开即只读预览；可切编辑（所见即所得）/ 源码 | 工作区文本保存（大表隐藏行会拼回） |
| HTML / HTM | 同源站点 iframe，脚本/表单/弹层可用；相对资源走 `/api/agent-pi/site/z/…` | 不在预览里改站点文件 |
| xlsx / csv / tsv / docx / pptx / .univer | 优先嵌官方 Gateway Viewer（与对话完全体同一套）；官方未就绪时才用精简预览 | 完全体改动保存在 sidecar `.univer` 草稿；精简回退仍可保存回原文件 |
| 旧 OLE（xls / doc / ppt） | 说明 | 不可保存；请另存为 xlsx / docx / pptx |

挂官方 Viewer 时必须把 `inner.webServer` 原样传给 `attachHttp`。不能 `{ ...inner }`：Cordis 的服务在代理 getter 上，摊开后 `webServer` 丢失，`/api/agent-pi/*` 全部 404，右侧资源文件会显示 Not Found。

右侧点 Excel / Word / PPT 不再只开精简预览。宿主可选读取 `ctx.get('univer')`（不 `inject`，以免没装官方插件时 fiber 挂起）：`.univer` 直接取 Gateway `viewerUrl` / 草稿 `worktreeUrl`；xlsx/csv/tsv/docx/pptx 先 `univer_new` 一个隐藏 sidecar，再 `worktree` + `importUnitContent`（官方分别映射为 sheet / doc / slide），覆盖层 iframe 嵌官方 Viewer（`mode=embedded`）。官方路径授权要求 workspace / file / source 都是 canonicalize 后的绝对路径。失败才回退精简预览。源文件变更后删 `.agent-pi/univer-preview` 可强制重新导入。站点资源不提供 `.env` / `.pem` / `.key` / `credentials.yaml`。

---

## 招标解析深度门槛 / Analysis suite gate

合格分析不是「有一份总报告」就过。出厂硬门槛是五份通用深度稿（文件名固定，不带合同号），外加原来的逐文件解析稿、`项目特征.md`、`招标文件解析总报告.md`：

| 文件 | 必须覆盖 |
| --- | --- |
| `招标文件总结.md` | 基本信息、资格、评标、合同/商业、返标、时间、风险 |
| `工程量清单分析.md` | 总价、分册/Schedule、PC Sum 或暂定、报价策略、风险 |
| `工程范围与技术规范总结.md` | 合同数据、范围、规范、HSE |
| `合同特殊条款与规范修订总结.md` | 特殊条款对照、优先级/支付/分包、规范修订、索赔/EOT |
| `技术标文件要求汇总.md` | 返标总表、A 系列、B 系列/评分、方法说明书深度 |

每份至少约 3500 字，缺文件 / 过短 / 缺章节时 `complete_stage` 拒绝。总报告不能代替这五份。

**不预装**任何一单的原文（金额、里程、罚款、地名会污染下一标）。知识库只绑结构标准 `knowledge/tender-generic/analysis_suite_depth.md`。你自己的合格稿可以入库当「用户模板」勾选复刻目录，那是加分，不是门槛。

监控原先在会话空闲后只认 busy→idle 边沿，阶段稿一旦写入就挂「等待执行」，浅总报告又能把阶段标成已完成，所以会整单重扫或空转。这版：

- 源文件稿齐了但套件未齐：阶段保持进行中，监控发「补齐深度套件」稿，禁止重扫已完成源文件
- 空闲就续跑（不单靠 busy→idle），同一指纹不重写
- 「检查」和监控备注列出缺哪一份、谁过短、缺哪一章
- 套件文件落地后指纹变化，再催下一份缺口

---

## 已知限制

- 覆盖层 Univer 会写回格子值和公式字段，但会丢掉大部分样式、合并单元格和完整 OOXML 对象；需要原样保真时请在 Excel 里改。
- 旧二进制 Office 不能在预览里写回。
- HTML 预览能跑同目录相对资源，不是完整本地 Web 服务器。
