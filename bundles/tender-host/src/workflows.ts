export interface WorkflowStage {
  id: string
  label: string
  labelZh: string
  hintZh: string
  prompt: string
  skillSlugs: string[]
  /**
   * Reviewer skills for this stage's deliverables. When present, the stage draft
   * instructs the writer to route every deliverable through a reviewer subagent
   * carrying these skills; the reviewer answers ACCEPT_AND_PROCEED or
   * REVISE_AND_RETRY with a fix list (max 2 revise rounds, then escalate to the user).
   */
  reviewSkillSlugs?: string[]
  /** Write per-file briefs for the workbench checklist. Does not spawn workers. */
  listsSources?: boolean
  /**
   * Mandatory stage-level synthesis document. When present, the stage cannot be
   * considered clean until this file exists in the stage's official output dir;
   * the stage draft and the organize health check both enforce it.
   */
  summaryDeliverable?: { fileName: string; outlineZh: string[] }
}

export interface WorkflowDefinition {
  id: string
  /** Business module id; built-ins are tender/delivery/investment, user modules add more. */
  module: string
  label: string
  labelZh: string
  /**
   * Stage completed by the user in the workbench UI (material registration), never
   * dispatched to the model. Stages after it are gated on its completion. Absent
   * for modules whose first stage is already model work.
   */
  setupStageId?: string
  /** Knowledge-profile binding area feeding each stage's draft and briefs. */
  bindingAreaByStage?: Record<string, 'analysis' | 'pricing' | 'planning'>
  /**
   * User-chosen knowledge-base slugs for this module. When present, stage drafts
   * read these instead of the factory file-path bindings. Empty arrays mean
   * "no pack for that area".
   */
  kbPack?: {
    analysis?: string[]
    pricing?: string[]
    planning?: string[]
  }
  stages: WorkflowStage[]
}

export const WORKFLOWS: Record<string, WorkflowDefinition> = {
  tender: {
    id: 'tender-main',
    module: 'tender',
    label: 'Tender workflow',
    labelZh: '投标全流程',
    setupStageId: 'project-setup',
    bindingAreaByStage: {
      'project-setup': 'analysis',
      'tender-document-analysis': 'analysis',
      'boq-five-step-pricing': 'pricing',
      'planning-and-submission': 'planning',
    },
    stages: [
      {
        id: 'project-setup',
        label: 'Project setup',
        labelZh: '项目资料登记',
        hintZh: '上传并登记招标资料。PDF / Word / Excel 按知识库同一套逻辑对齐成解析稿，可预览、改稿；保存时同步 sidecar JSON。齐套后进入解析。',
        prompt: '上传并登记招标资料即可。PDF、Word、Excel 先按知识库同一套逻辑对齐为 Official Outputs setup/ 下的 manuscript.md + pack.json，用户改稿保存后 units 必须跟上。资料齐套后由用户确认进入解析；本步不派生子智能体，不进行组价或策划。登记说明沿用招标文件原名与原术语，禁止 AI 导读腔。',
        skillSlugs: ['tender-intelligence-core', 'tender-project-boundary'],
      },
      {
        id: 'tender-document-analysis',
        label: 'Document analysis',
        labelZh: '招标文件解析',
        hintZh: '逐文件解析之后，必须落地五份深度分析稿、总报告，以及从实际 BOQ 抽出的清单 pack；没有清单不得收阶段。',
        prompt: '对每个已登记文件产出可读 Markdown 解析稿（一等成果），归纳关键约束与交叉引用；完成后合成 document_analysis 与 boq_reconciliation，并汇总编制「项目特征」专章与《招标文件解析总报告》。同一目录还必须写出分析深度套件五份（总报告不能代替）：《招标文件总结.md》《工程量清单分析.md》《工程范围与技术规范总结.md》《合同特殊条款与规范修订总结.md》《技术标文件要求汇总.md》。每份覆盖对应大纲、至少约 3500 字；缺文件 / 过短 / 缺章节时不得 complete_stage。必须从每份已登记的实际工程量清单（BOQ / Bill of Quantities / Pricing Schedule / 工程量）抽出全部可识别真实行，tender_capability replace boq_reconciliation，每行带清单号、单位、数量、sheet+cell；PC Sum / Provisional Sum / percentage 等传递项也登记，只是不进入五步直接费组价。系统会反查 BOQ 解析稿中的显式清单号，局部样本不得过关。《工程量清单分析.md》点名代表性清单号。没有清单或覆盖不全的项目绝对不能过解析关，特征门 / force_pass 不能放行。只借结构与写法，禁止抄上一单合同号、金额、里程或罚款。全部客户可读成果必须写入本阶段成果目录 document-analysis/，不得散落项目根目录。缺规范/合同/地质原文的条目必须标为缺口，禁止用模型记忆填空。源文件解析稿已 done 的不要重扫。若需并行拆分，使用 dsh 原生 subagent / workflow（走 harness 默认滚动池，不要产品层限人数）。子任务同时交付 JSON+MD，不得由主会话代写 MD。',
        skillSlugs: ['tender-document-parsing', 'tender-boq-reconciliation', 'tender-formal-writing'],
        reviewSkillSlugs: ['deliverable-reviewer'],
        listsSources: true,
        summaryDeliverable: {
          fileName: '招标文件解析总报告.md',
          outlineZh: [
            '项目概况与项目特征（可引用「项目特征」专章）',
            '合同框架：合同版本、专用条款修订要点、优先级排序',
            '技术规范体系：规范版本、条文修订、适用范围',
            'BOQ 结构与统计：分册/章节/项数、与规范的映射缺口、移交下一阶段的完整清单文件指针',
            '投标程序与评分：资格条件、评分办法、必交 Form 清单',
            '关键日期、保函与保险要求',
            '风险与缺口清单（逐条带 [kb:…]/[src:…] 引用令牌）',
          ],
        },
      },
      {
        id: 'boq-five-step-pricing',
        label: 'BOQ five-step pricing',
        labelZh: 'BOQ 逐页组价与资源汇总',
        hintZh: '以项目特征为依据逐章组价；缺口不得臆造。',
        prompt: '以解析阶段汇总的「项目特征」（document-analysis/项目特征.md）与《招标文件解析总报告》为组价依据，结合 orchestration/reports/ 下的 BOQ 工作表 sidecar JSON，按清单分册/章节逐项组价。全部客户可读成果写入本阶段成果目录 boq-pricing/。章节 Markdown 与《BOQ 组价总报告.md》写完后，必须再调用 tender_pricing_workbook generate 产出带公式的《BOQ 组价测算.xlsx》（Summary + Rates + 每项一页，块结构对齐出厂单价分析样例）。工效与单价必须跟本标地址走：先 anysearch_capabilities，再用 anysearch_search / anysearch_batch_search（zone=intl, language=en）搜当地工效、气候、柴油、机械湿租、料场和供应商；禁止抄 C5.1 范文日产与兰特价，禁止套中国定额。收阶段写出《当地供应商尽调.md》《当地工效尽调.md》《询价单总表.md》和 询价单/ 中英询价单。询价回不齐或当地工效网页核不到时，tender_evidence waive_pricing（或对本阶段 tender_stage force_pass）并写《组价依据说明.md》，策划可按网络询价+推导推进，必须注明非正式回价。项目特征缺口不得臆造。先 tender_capability action=schema，禁止把 rateBasis / planningBasis / sources 写在 pack 顶层。燃油/工资/机械/水泥/骨料/沥青/分包必须 web_search 或 web_fetch 核现行市场价，写入 costComponents[].rateBasis.webEvidence；与 webDiligenceAuthorized 无关。南非公路人工另读 sa-labour-wages.md（BCCEI 等级 + 国家最低工资）。当地情报读 local-site-intel.md、local-productivity.md 与 supplier-rfq.md。若需按册并行，使用 dsh 原生 subagent / workflow（走 harness 默认滚动池，不要产品层限人数）。',
        skillSlugs: ['tender-boq-five-step-pricing', 'tender-evaluation-strategy', 'tender-bidder-commitments', 'tender-formal-writing'],
        reviewSkillSlugs: ['deliverable-reviewer'],
        listsSources: true,
        summaryDeliverable: {
          fileName: 'BOQ 组价总报告.md',
          outlineZh: [
            '组价方法与依据（项目特征、规范映射、缺口处理原则）',
            '总价构成：分册/章节小计与合计，与 Pricing Schedule 对账',
            '资源汇总：人工/机械/材料/燃油等大项消耗与来源假设',
            '未定价与待询价项清单（逐条带引用令牌）',
            '当地供应商尽调、当地工效尽调与中英双语询价单指针（电话、邮箱、规格、工效来源）',
            '若强制放行：组价依据说明（网络询价+推导，非正式回价）',
            '移交下一阶段的成果文件指针',
            '公式测算表《BOQ 组价测算.xlsx》：蓝字/黄底可改，合计与表头 RATE 保持公式',
          ],
        },
      },
      {
        id: 'planning-and-submission',
        label: 'Planning and submission',
        labelZh: '施工策划、进度、成本与出稿',
        hintZh: '按可见子步骤推进：施工策划 → 进度/资源/现金流 → 正式出稿。',
        prompt: '按可见子步骤推进：施工策划 → 进度/资源/现金流 → Work Plan 与一致性核对。不得跳过子步骤门禁。工期与资源先读组价阶段的 planningBasis 与《当地工效尽调.md》；若存在《组价依据说明.md》，策划必须按「网络询价 + 工效推导、非正式回价」标注依据，回价到达后再替换。项目特征缺口不得臆造。',
        skillSlugs: [
          'tender-execution-planning',
          'tender-schedule-resource-planning',
          'construction-schedule-planner',
          'tender-cost-cashflow-planning',
          'tender-submission-documents',
          'tender-submission-audit',
          'professional-report',
          'tender-formal-writing',
        ],
        reviewSkillSlugs: ['deliverable-reviewer', 'tender-submission-audit'],
      },
    ],
  },
  delivery: {
    id: 'delivery-main',
    module: 'delivery',
    label: 'Delivery controls',
    labelZh: '实施控制',
    stages: [
      {
        id: 'delivery-setup',
        label: 'Delivery setup',
        labelZh: '实施工作区建立',
        hintZh: '确认实施输入、数据日期、合同范围、控制基准与交付物。',
        prompt: '建立 Delivery Workspace 与基线控制总控。使用 project-delivery-controls-core。',
        skillSlugs: ['project-delivery-controls-core'],
      },
      {
        id: 'delivery-controls',
        label: 'Controls cycle',
        labelZh: '合同范围 / 进度 / 成本 / 风险',
        hintZh: '按实施 skills 更新合同范围、进度、采购、成本、现金流、风险变更与期末报告。',
        prompt: '按实施 skills 更新合同范围、进度、采购、成本、现金流、风险变更与期末报告。并行拆分交给 dsh 原生 subagent / workflow，不要产品层限人数。',
        skillSlugs: [
          'project-delivery-contract-scope',
          'project-delivery-programme-progress',
          'project-delivery-resource-procurement',
          'project-delivery-cost-commercial',
          'project-delivery-cashflow',
          'project-delivery-risk-change',
          'project-delivery-reporting-audit',
        ],
        reviewSkillSlugs: ['deliverable-reviewer'],
      },
    ],
  },
  investment: {
    id: 'investment-main',
    module: 'investment',
    label: 'Investment diligence',
    labelZh: '投资尽调',
    stages: [
      {
        id: 'investment-setup',
        label: 'Mandate setup',
        labelZh: '授权与工作区',
        hintZh: '确认投资阶段、授权边界、估值基准日、资料和决策门槛。',
        prompt: '建立投资研究 Workspace，冻结知识快照与假设。',
        skillSlugs: ['resource-investment-intelligence-core', 'resource-investment-mandate-screening'],
      },
      {
        id: 'investment-diligence',
        label: 'Diligence and IC pack',
        labelZh: '尽调与决策包',
        hintZh: '技术、市场、法律 ESG、估值与交易决策包。',
        prompt: '技术、市场、法律 ESG、估值与交易决策包。并行拆分交给 dsh 原生 subagent / workflow，不要产品层限人数。',
        skillSlugs: [
          'resource-investment-technical-diligence',
          'resource-investment-market-offtake',
          'resource-investment-legal-esg',
          'resource-investment-financial-valuation',
          'resource-investment-transaction-decision',
        ],
        reviewSkillSlugs: ['deliverable-reviewer'],
      },
    ],
  },
}
