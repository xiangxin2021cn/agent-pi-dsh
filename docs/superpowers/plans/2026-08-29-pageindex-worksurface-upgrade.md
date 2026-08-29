# Agent Pi DSH PageIndex / WorkSurface 长文档知识面升级计划

状态：方案已批准，待 3.4.1 工作台收敛后按门槛实施
候选版本：3.4.2+
前置版本：Agent Pi DSH 3.4.1 / DSH 0.1.2-alpha.1
许可边界：只评估并引入 MIT 许可的 PageIndex 必要部分；不整体引入 OpenKB。

## 1. 目标和不变项

目标是在不取代 Agent Pi 业务底座的前提下，提升长篇招标文件的结构导航、证据命中、跨知识面路由和自然引用能力。

以下组件保持业务权威，不由 PageIndex 替代：

- DSH 主智能体和投标编排。
- `tender-host` 持久化项目、阶段、任务和审批门禁。
- MinerU / 现有文件转换器的 OCR、页码、图片和表格恢复。
- 精确条款号、表格及现有 MiniSearch 检索。
- `boq_reconciliation` 能力包、BOQ 行列/单元格溯源和硬门禁。
- 价格冻结、详细组价、合规检查和最终提交冻结。
- Official Outputs 和现有引用审计。

## 2. 与 3.4.1 的边界

3.4.1 继续收敛工作面板，不整体重写。不在 3.4.1 引入 PageIndex 运行时、Python 环境、第二知识库 UI 或新的自动推进规则。

3.4.1 前端收敛顺序固定为：

1. API 客户端与每会话监控。
2. 工作台视图。
3. 知识库。
4. 文件预览。
5. Electron / Playwright Windows 冷启动和关键交互测试。

每一轮都必须保持生成的 `lib/client.js` 行为不变，并将测试从文本匹配逐步转为可执行的模块、DOM 和桌面启动验证。

## 3. 目标架构

```text
DSH 主智能体 / 投标编排
           |
           v
知识面路由器 (document | table | graph | combined)
    |                 |                 |
    v                 v                 v
PageIndex 长文档树    BOQ 结构化表面       能力/版本依赖图
    |                 |                 |
    +-----------------+-----------------+
                      v
              结构化证据包
                      |
                      v
       自然引用渲染 + 内部定位审计
```

PageIndex 只回答“长文档中应当看哪个章节和页段”。BOQ 数量、计算、公式和全量覆盖继续走结构化表面；上游版本、能力依赖和过期影响走图表面。

## 4. Phase 0：投标版 WorkSurface 评测集

在接入 PageIndex 前先冻结一批可审计任务，避免“看起来更聪明”成为上线依据。

### 4.1 任务分类

- 文档题：资格、商务、合同、保险、技术条款、格式表单。
- 表格题：BOQ 编码、数量、单位、工作表、清单联结、汇总和价格计算。
- 依赖题：阶段前置、能力包版本、上游变更、下游过期和重做范围。
- 跨知识面题：文档+表格、文档+依赖、表格+依赖以及三面组合。

### 4.2 每道题的权威数据

```json
{
  "id": "tender-doc-table-001",
  "question": "...",
  "requiredSurfaces": ["document", "table"],
  "goldEvidence": [
    { "surface": "document", "sourceId": "...", "page": 137, "section": "3.4" },
    { "surface": "table", "workbook": "...", "sheet": "BOQ", "cellRange": "B31:F31" }
  ],
  "dependencyPath": [],
  "answerRubric": [],
  "forbiddenClaims": []
}
```

首批建议 80–120 道原子任务，必须包含真实页码、单元格和依赖路径，不用 LLM 自行生成的引用作为金标。

### 4.3 指标

- Route F1：是否选中必要知识面。
- Evidence precision / recall：是否取得正确页、单元格和依赖路径。
- Answer：结论完整性、数字正确性和风险判断。
- Efficiency：工具调用次数、Token、索引时间、查询耗时和模型费用。
- Tender coverage：要求域覆盖率、BOQ 行覆盖率、无证据关键结论比例。

## 5. Phase 1：PageIndex 影子索引

- 只对长篇叙事类 PDF / Markdown 建立树索引。
- 建议保存为 `setup/<source>/pageindex-tree.json`，不写入 Official Outputs。
- 索引绑定源文件内容哈希、解析器版本、PageIndex 版本、模型和生成时间。
- 源文件、`manuscript.md` 或 `pack.json` 变更后使影子索引过期，不得静默沿用。
- 影子索引不参与正式结论、阶段完成和 BOQ 门禁。

同一批评测题同时运行：

1. 现有 MiniSearch + 条款/表格定位。
2. PageIndex 树 + 定向页读取。
3. 推荐混合策略：精确条款优先现有定位，结构/跨章问题优先 PageIndex。

## 6. Phase 2：DSH 知识面路由

路由结果必须是类型化计划，而不是自由文本：

```json
{
  "surfaces": ["document", "table"],
  "documentIds": ["volume-1"],
  "tableIds": ["boq-main"],
  "reason": "contract rule plus exact BOQ quantities",
  "budget": { "documentReads": 4, "tableQueries": 2, "graphReads": 0 }
}
```

路由规则：

- 叙事事实、合同、规范、技术和跨章关系→ document。
- 精确数量、过滤、联结、汇总、价格和公式→ table。
- 上游版本、能力依赖、影响范围和过期状态→ graph。
- 精确条款号先走现有 `kb_find_clause`，失败再进入文档树。
- 无结构化表面时不得用文档摘要代替 BOQ 计算。

## 7. Phase 3：结构化证据包和自然引用

内部定位符不再直接承担用户展示：

```json
{
  "claimId": "claim-001",
  "claim": "投标保证金为合同估算价的2%",
  "surface": "document",
  "sourceId": "tender-volume-1",
  "section": "3.4 投标保证金",
  "page": 137,
  "quote": "...",
  "internalLocator": "kb:tender-volume-1:chunk-184",
  "sourceHash": "..."
}
```

- DSH 写作使用 claim + quote + 人类可读位置。
- 审计继续使用不可变 `internalLocator` 和源哈希。
- Markdown / Office 展示渲染为「招标文件第一卷，§3.4，p.137」。
- 表格证据显示工作簿、工作表、行号/单元格；图证据显示依赖路径。
- 渲染方式变更不得降低引用定位有效率。

## 8. Phase 4：投标分析覆盖遍历

PageIndex 不得只服务单次问答。第二步招标文件分析必须根据文档树生成覆盖计划，并按以下要求域记账：

- 资格和投标/不投标风险。
- 商务、合同、保险、担保、税费和支付。
- BOQ、计价原则、暂列金额和调价规则。
- 施工范围、技术标准、进度、资源和临建条件。
- 合规、废标项、签署、格式表单和最终提交要求。

每个要求域必须记录已读树节点、未读节点、证据、结论和待人工确认事项。

## 9. Phase 5：默认导航器切换

只在影子评测通过后，PageIndex 才能成为长篇叙事文档的默认导航器。短文档、精确条款号和结构化表格仍使用现有快路径。

上线前必须决定本地运行形式：

1. 短期开发：独立 Python 影子 worker，不进正式安装包。
2. 正式产品：评估最小 Python 运行时与 Node/TypeScript 适配两种方案。
3. 模型调用必须复用 Agent Pi 的供应商和凭据管理，不在第二进程再弹 API Key。
4. 索引只在文件新增/变更时构建，不阻塞应用冷启动。

## 10. 验收门槛

1. BOQ 行项目、数量、单位、工作表和单元格覆盖不得低于现有基线。
2. 文档证据 recall 相对当前基线提高至少 10 个百分点。
3. Route F1 ≥ 0.95。
4. 引用定位有效率 = 100%。
5. 无证据关键结论 ≤ 1%。
6. 跨项目事实、摘要或索引泄漏 = 0。
7. 索引缓存后不明显增加会话启动时间；索引不在 Electron 首屏关键路径上。
8. 影子索引禁用或损坏时，现有 MiniSearch、条款、MinerU、BOQ 和门禁全部可用。
9. 索引的模型调用、Token、耗时和估算费用全部可记录和对比。

## 11. 明确不做

- 不整体引入 OpenKB 的 Wiki、Web UI、FastAPI 和第二套项目状态。
- 不将 PageIndex 摘要当作原始证据。
- 不用 PageIndex 替代 Excel/BOQ 计算、公式、联结和全量校验。
- 不因为新索引而增加全局自动唤醒、崩溃自动注入或无事务自动推进。
- 不修改 DSH 内核。
