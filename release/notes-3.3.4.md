# Agent Pi DSH 3.3.4 — 解析必须摸到实际 BOQ，组价按企业工效与人工复核走

**3.3.4** 把上一轮现场卡死和组价用错清单收进同一版。招标文件解析不再能拿五份空话深度稿过关：必须从已登记的工程量清单抽出真实行，写入 `boq_reconciliation`，《工程量清单分析.md》还要点名这些清单号。没有清单的项目绝对不能进组价。同一版撤回产品并发帽、把组价 schema 摊开、恢复当地询价联网，创建项目时企业工效最高优先，预览改日产/关键价确认后全局重算。内核仍钉 DeepSeek Harness **`dsh-v0.1.1-rc.2`**。没有新的会话库格式断裂。

对外下载见 [GitHub Release v3.3.4](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v3.3.4)。知识库行为以 [notes-3.3.2.md](./notes-3.3.2.md) 为准。

---

## 这版你先测什么 / What to test first

覆盖安装**不改** `%APPDATA%\agent-pi-dsh-desktop\dsh-home` 里已有知识库。请**完全退出**再装（关掉托盘）。未签名：SmartScreen 选「仍要运行」。

1. 开一轮只有规范/合同、没有 BOQ 表的项目：五份深度稿和总报告写齐后，`complete_stage` 仍应被拒绝，检查面板写「未摸到实际工程量清单」。`force_pass` / 特征门放行不能代替这一条。
2. 登记一份真实 `BOQ` / `Bill of Quantities` / `Pricing Schedule` / `工程量` 文件，抽出至少 3 条带清单号、单位、数量、sheet+cell 的行，并在《工程量清单分析.md》点名这些号，解析关才能过。
3. 创建项目时附企业工效表：组价应优先用文件数字，不得被网页或 C5.1 范文覆盖。
4. 在 `boq-pricing` 章节 Markdown 改日产或柴油等关键价后点保存：应弹出「确认人工复核并全局调整」，确认后数量和《BOQ 组价测算.xlsx》跟着变。
5. 重启后看 `$DSH_HOME/settings.yaml`：不应再被压成 `maxParallelToolCalls: 4`（除非你自己写成 4）。组价应先 `tender_capability schema`，并行工人和 `anysearch_batch_search`（`zone=intl`）能派出。

Windows 安装包：[`Agent-Pi-DSH-3.3.4-x64.exe`](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-x64.exe)。SHA256：`f10d7643ea0a0bf22deef0807323990790199a284ae7d4930e987b46615133bb`。macOS arm64 / Linux x64 由同一 Release 上的 CI 回传。

---

## 解析关必须摸到实际清单 / BOQ inventory hard gate

上一轮组价把清单搞错，是致命伤。深度套件只查章节词和字数，占位字就能过机械条；`complete_stage` 也不读 `boq_reconciliation`。

这版把清单门钉在解析关，且**不可放行**：

- 必须存在 `packs/boq-reconciliation.json`，至少 3 条有效行（清单号带数字、描述、单位、正数量、sheet+cell）
- 来源必须是已登记、磁盘上还在的 BOQ 类文件，不能从规范 PDF 编造
- 《工程量清单分析.md》必须点名这些清单号
- 示范 / 占位行（`demo`、`template`、`示例` 等）不算
- 特征门、`tender_stage force_pass`、组价 `waive_pricing` **都不能**让无清单项目进入组价

检查面板会单独列出这份缺口；监控空闲只催抽本标 BOQ，不重扫已完成源文件。

---

## 企业工效优先与预览全局调整 / Productivity and reviewed rates

- 创建/登记时若附企业工效文件（文件名含工效 / productivity / 日产等），企业数字最高优先，并种《当地工效尽调.md》达标底稿。
- 优先级：企业文件 > 本标人工复核 > 当地网页 > 国际手册 × 当地特征。禁止套中国公路定额。
- 章节稿改关键资源单价或日产后保存，先确认「这些是本标人工复核准确数，现在全局调整」。确认后写入 `reviewed-rates.json`，重算数量并重生测算表；之后模型 `replace` 组价包不会盖掉这些数。

---

## 组价能跑通 / Pricing unblocked

相对 3.3.3 的现场修复一并进入本版：

- 托管 overlay **不再写入** `agent-loop.maxParallelToolCalls: 4`，恢复 DSH 默认滚动池
- `tender_capability action=schema`；`replace` 失败写出允许的顶层字段
- 市场单价 `web_search` / AnySearch（`zone=intl`）始终要做，与 `webDiligenceAuthorized` 无关
- 南非公路人工走 BCCEI / 国家最低工资检索，禁止抄 C5.1 范文兰特价
- 询价回不齐时 `waive_pricing` +《组价依据说明.md》可进策划；**解析清单门不在此列**

---

## 已知限制

- 解析关要求至少 3 条真实行，不要求一次抽完全部分册。组价仍按已登记行做，漏行要回到解析补 pack。
- 未签名安装包。覆盖安装前必须完全退出。
