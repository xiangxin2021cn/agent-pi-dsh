import type { TenderCapabilityId } from '../../../packages/business-core/src/tender/index.ts'

export type StageConsume =
  | { kind: 'handoff'; stageId: string; required?: boolean }
  | { kind: 'capability'; capability: TenderCapabilityId; required?: boolean }

export interface WorkflowStage {
  id: string
  label: string
  labelZh: string
  hintZh: string
  prompt: string
  skillSlugs: string[]
  /** Machine-readable prior baselines required before this stage can close. */
  consumes?: StageConsume[]
  /** Reviewer skills available to the stage's risk/change/sample review policy. */
  reviewSkillSlugs?: string[]
  /** Review every file only for legacy/custom workflows; tender defaults to risk-based review. */
  reviewPolicy?: 'all' | 'risk-based'
  /** A model cannot close this stage; the user records the decision in the workbench. */
  approvalGate?: {
    promptZh: string
    approveLabelZh: string
    rejectLabelZh?: string
  }
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
  /** Reuse a built-in domain's deterministic hard gates without coupling them to the module id. */
  controlProfile?: 'tender'
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
    controlProfile: 'tender',
    label: 'Tender workflow',
    labelZh: '投标全流程',
    setupStageId: 'project-setup',
    bindingAreaByStage: {
      'project-setup': 'analysis',
      'bid-risk-decision': 'analysis',
      'tender-document-analysis': 'analysis',
      'pricing-basis-freeze': 'pricing',
      'boq-five-step-pricing': 'pricing',
      'planning-and-submission': 'planning',
      'submission-compliance-freeze': 'planning',
    },
    stages: [
      {
        id: 'project-setup',
        label: 'Project setup',
        labelZh: '项目资料登记',
        hintZh: '上传并登记招标资料。PDF / Word / Excel 按知识库同一套逻辑对齐成解析稿，可预览、改稿；保存时同步 sidecar JSON。齐套后进入解析。',
        prompt: '上传并登记招标资料即可。PDF、Word、Excel 先按知识库同一套逻辑对齐为 Official Outputs setup/ 下的 manuscript.md + pack.json，用户改稿保存后 units 必须跟上。资料齐套后由用户确认进入解析；长叙事解析稿会在保存时生成 PageIndex 影子树，复用当前模型配置且不弹第二个 API Key。影子树仅用于导航，不改变本阶段结论。本步不派生子智能体，不进行组价或策划。登记说明沿用招标文件原名与原术语，禁止 AI 导读腔。',
        skillSlugs: ['tender-intelligence-core', 'tender-project-boundary'],
        consumes: [],
      },
      {
        id: 'bid-risk-decision',
        label: 'Bid decision and critical risks',
        labelZh: '投标决策与重大风险',
        hintZh: '先形成投标/不投标建议、重大风险、澄清清单和决策条件，再由用户明确确认是否继续。',
        prompt: '只做投标决策，不展开全文长报告或详细组价。基于已登记资料编制《投标决策与重大风险评估.md》：项目边界、采购制度与适用法域、投标主体/JV/分包结构、CIDB/资格与评分门槛、关键日期、保函/保险、合同与现金流重大风险、税务/外汇/用工/本地化义务、资料缺口、需要澄清的问题、央企内部法务/商务/财税/资金/履约审批责任人、建议投标/不投标及成立条件。法规、工资、税费只认现行官方来源，招标特定规则以招标文件为准；缺资料保持为缺口。完成后停止，等待用户在工作台明确选择「确认投标，继续」或「不投标，暂停」，不得由模型代替用户决策。',
        skillSlugs: ['tender-intelligence-core', 'tender-evaluation-strategy', 'tender-project-boundary', 'tender-overseas-professional-control'],
        consumes: [{ kind: 'handoff', stageId: 'project-setup' }],
        reviewSkillSlugs: ['deliverable-reviewer'],
        reviewPolicy: 'risk-based',
        summaryDeliverable: {
          fileName: '投标决策与重大风险评估.md',
          outlineZh: [
            '投标/不投标建议与成立条件',
            '资格、评分、关键日期与必交材料',
            '合同、保函、保险、现金流和履约重大风险',
            '资料缺口、澄清问题与责任人',
          ],
        },
        approvalGate: {
          promptZh: '请确认是否接受本轮投标建议并进入招标分析。',
          approveLabelZh: '确认投标，继续',
          rejectLabelZh: '不投标，暂停',
        },
      },
      {
        id: 'tender-document-analysis',
        label: 'Document analysis',
        labelZh: '招标文件解析',
        hintZh: '逐文件解析后汇总成一套可追溯的《投标分析底稿》，并完整抽取实际 BOQ；专题视图只在用户需要时从底稿派生。',
        prompt: '对每个已登记文件产出可读 Markdown 解析稿并保留原始术语、页码/行号和交叉引用；完成后合成 document_analysis 与 boq_reconciliation，并编制唯一权威底稿《投标分析底稿.md》。底稿统一承载来源索引、项目边界、资格与评分、关键日期、合同/保险/保函、技术规范、BOQ 覆盖、提交清单、风险与缺口；不得为凑数量重复写五份长报告。招标总结、合同条款、技术要求、BOQ 分析等专题稿改为用户明确需要时从底稿派生的视图，不作为收阶段硬门。必须从每份已登记的实际工程量清单（BOQ / Bill of Quantities / Pricing Schedule / 工程量）抽出全部可识别真实行，tender_capability replace boq_reconciliation；每行带清单号、单位、数量、sheet+cell，PC Sum / Provisional Sum / percentage 等传递项也登记。系统会反查解析稿中的显式清单号，局部样本不得过关；没有清单或覆盖不全不得 complete_stage。全部客户可读成果写入 document-analysis/。缺规范、合同、地质原文必须标为缺口，禁止用模型记忆填空。已完成的源文件解析稿不要重扫。检索前调用 tender_knowledge action=route：叙事问题用 navigate，版本/补遗/能力失效用 graph，数量/单位/公式必须继续使用 BOQ 表格与 sheet+cell，严禁以 PageIndex 摘要代替表格计算。PageIndex 命中只作导航，必须回读原文并用 evidence_record 冻结精确 quote、sourceHash 和 internalLocator，再在正文使用返回的自然引用与 [ev:claimId]。按 qualification-risk、commercial-contract、boq-pricing、scope-technical、submission-compliance 五个域逐项 coverage_record，未读节点、证据或结论有缺口不得收阶段。若需并行，使用 dsh 原生 subagent / workflow；子任务交付 JSON+MD。',
        skillSlugs: ['tender-document-parsing', 'tender-boq-reconciliation', 'tender-formal-writing', 'tender-overseas-professional-control'],
        consumes: [
          { kind: 'handoff', stageId: 'project-setup' },
          { kind: 'handoff', stageId: 'bid-risk-decision' },
        ],
        reviewSkillSlugs: ['deliverable-reviewer'],
        reviewPolicy: 'risk-based',
        listsSources: true,
        summaryDeliverable: {
          fileName: '投标分析底稿.md',
          outlineZh: [
            '来源索引、项目边界与项目特征',
            '合同框架：合同版本、专用条款修订要点、优先级排序',
            '技术规范体系：规范版本、条文修订、适用范围',
            'BOQ 结构与统计：分册/章节/项数、与规范的映射缺口、移交下一阶段的完整清单文件指针',
            '投标程序与评分：资格条件、评分办法、必交 Form 清单',
            '关键日期、保函与保险要求',
            '风险与缺口清单（逐条带 [kb:…]/[src:…] 引用令牌）',
            '可按需派生的专题视图清单与当前生成状态',
          ],
        },
      },
      {
        id: 'pricing-basis-freeze',
        label: 'Pricing basis freeze',
        labelZh: '组价基准冻结',
        hintZh: '把币种、税费、工资、材料、机械、工效、风险费和缺口处理冻结成可追溯基准，再由用户确认进入详细组价。',
        prompt: '读取《投标分析底稿.md》和完整 boq_reconciliation，编制《组价基准冻结单.md》。逐项列出币种/汇率时点、VAT/税费/关税、工资与雇主负担体系、材料与机械来源、运距与当地工效、分包与供应商询价状态、现场管理费/总部管理费/利润/涨价/风险费原则、暂列金额/计日工处理、资料缺口和允许使用的暂定假设。每个外部价格注明日期、地区、官方/正式回价/网络价/推导证据等级和有效期；列 BOQ 行审核覆盖率与金额加权核证覆盖率。南非土木工程人工必须核对当前 BCCEI 公报，不得沿用旧范文工资。重大成本仍为 draft/unverified、现行法定费率未落实或相对雇主估算/历史基准存在未解释重大偏差时，保持未冻结。完成后停止，等待用户在工作台确认基准；不得由模型自行冻结。',
        skillSlugs: ['tender-boq-five-step-pricing', 'tender-evaluation-strategy', 'tender-project-boundary', 'tender-overseas-professional-control'],
        consumes: [
          { kind: 'handoff', stageId: 'tender-document-analysis' },
          { kind: 'capability', capability: 'document_analysis', required: false },
          { kind: 'capability', capability: 'boq_reconciliation', required: false },
        ],
        reviewSkillSlugs: ['deliverable-reviewer'],
        reviewPolicy: 'risk-based',
        summaryDeliverable: {
          fileName: '组价基准冻结单.md',
          outlineZh: [
            '币种、汇率、税费和价格时点',
            '人工、材料、机械、工效与分包来源',
            '供应商询价状态及正式回价/网络询价/推导的区分',
            '风险费、暂列金额、计日工与缺口处理规则',
            '用户需要确认的暂定假设',
          ],
        },
        approvalGate: {
          promptZh: '请确认组价基准和暂定假设，再进入详细 BOQ 组价。',
          approveLabelZh: '确认基准，开始组价',
        },
      },
      {
        id: 'boq-five-step-pricing',
        label: 'BOQ five-step pricing',
        labelZh: 'BOQ 逐页组价与资源汇总',
        hintZh: '以项目特征为依据逐章组价；缺口不得臆造。',
        prompt: '以已获用户确认的《组价基准冻结单.md》、《投标分析底稿.md》和完整 boq_reconciliation 为唯一组价基线，结合 orchestration/reports/ 下的 BOQ sidecar JSON，按分册/章节逐项组价。全部客户可读成果写入 boq-pricing/。章节 Markdown 与《BOQ 组价总报告.md》写完后，调用 tender_pricing_workbook generate 产出带公式的《BOQ 组价测算.xlsx》。不得悄悄改变已冻结币种、工资、材料、机械、工效、风险费或缺口处理；发现新证据与冻结基准冲突时停止并请求用户重新确认。当地工效和单价必须跟本标地址走：先 anysearch_capabilities，再 anysearch_batch_search（zone=intl）并用 web_search / web_fetch 复核；南非人工核 BCCEI。正式回价、网络询价和推导结果分列，写《当地供应商尽调.md》《当地工效尽调.md》和中英询价单；回价不足时 tender_evidence waive_pricing 并写《组价依据说明.md》。项目特征缺口不得臆造。先 tender_capability action=schema；燃油/工资/机械/水泥/骨料/沥青/分包写入 costComponents[].rateBasis.webEvidence。若需按册并行，使用 dsh 原生 subagent / workflow。',
        skillSlugs: ['tender-boq-five-step-pricing', 'tender-evaluation-strategy', 'tender-bidder-commitments', 'tender-formal-writing', 'tender-overseas-professional-control'],
        consumes: [
          { kind: 'handoff', stageId: 'tender-document-analysis' },
          { kind: 'handoff', stageId: 'pricing-basis-freeze' },
          { kind: 'capability', capability: 'boq_reconciliation', required: false },
        ],
        reviewSkillSlugs: ['deliverable-reviewer'],
        reviewPolicy: 'risk-based',
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
        label: 'Construction and technical proposal',
        labelZh: '施工与技术方案',
        hintZh: '基于冻结基准和详细组价形成施工组织、进度、资源、现金流和技术响应，不在本阶段宣称最终可提交。',
        prompt: '按可见子步骤推进：施工组织与方法 → 进度/资源 → 成本/现金流 → 技术响应与一致性核对。工期与资源读取组价阶段 planningBasis、《组价基准冻结单.md》和《当地工效尽调.md》；存在《组价依据说明.md》时必须标注网络询价/工效推导和非正式回价。现金流必须考虑计量/认证/付款滞后、预付款及回收、保留金、保函、VAT 时点、调价、融资需求和最大负现金流，不得只把直接成本按月摊开。编制《施工与技术方案总控.md》，关联 BOQ/工作包/进度/资源/现金流、全部明细成果和未决事项。本阶段只完成方案，不生成“最终可提交”结论；项目特征缺口不得臆造。',
        skillSlugs: [
          'tender-execution-planning',
          'tender-schedule-resource-planning',
          'construction-schedule-planner',
          'tender-cost-cashflow-planning',
          'professional-report',
          'tender-formal-writing',
          'tender-overseas-professional-control',
        ],
        consumes: [
          { kind: 'handoff', stageId: 'pricing-basis-freeze' },
          { kind: 'handoff', stageId: 'boq-five-step-pricing' },
          { kind: 'capability', capability: 'boq_reconciliation', required: false },
          { kind: 'capability', capability: 'boq_five_step_pricing', required: false },
        ],
        reviewSkillSlugs: ['deliverable-reviewer'],
        reviewPolicy: 'risk-based',
        summaryDeliverable: {
          fileName: '施工与技术方案总控.md',
          outlineZh: [
            '施工组织、关键方法与技术响应',
            '进度、资源、成本和现金流基线',
            '与 BOQ、合同、技术规范和组价基准的一致性',
            '未决事项、假设和最终提交阶段待核清单',
          ],
        },
      },
      {
        id: 'submission-compliance-freeze',
        label: 'Submission compliance and final freeze',
        labelZh: '合规检查与最终提交冻结',
        hintZh: '核对资格、表单、签字盖章、价格、技术方案和提交介质；用户确认后才标记为冻结版本。',
        prompt: '读取《投标分析底稿.md》、《组价基准冻结单.md》、《BOQ 组价总报告.md》、《施工与技术方案总控.md》和全部正式成果，执行最终 submission audit。编制《投标提交合规与冻结记录.md》：逐项列资格/CIDB/JV/税务与必交表单、评分与本地化证据、签字/见证/授权/盖章、保函保险、算术复核和跨文件价格一致性、技术与商务偏差、文件名/格式/份数/介质/截止时间/提交渠道、阻断项/警告/责任人/截止日和 maker-checker 记录。必须区分“文件存在”“内容完整”“已复核”“已授权”；不得把“文件已生成”写成“可提交”。任何重大未核证价格、法定用工/税务缺口、未签必交表或能力包 needs_review 均保持未冻结。完成后停止，等待用户在工作台最终确认冻结。',
        skillSlugs: [
          'tender-submission-documents',
          'tender-submission-audit',
          'tender-bidder-commitments',
          'professional-report',
          'tender-formal-writing',
          'tender-overseas-professional-control',
        ],
        consumes: [
          { kind: 'handoff', stageId: 'tender-document-analysis' },
          { kind: 'handoff', stageId: 'pricing-basis-freeze' },
          { kind: 'handoff', stageId: 'boq-five-step-pricing' },
          { kind: 'handoff', stageId: 'planning-and-submission' },
          { kind: 'capability', capability: 'document_analysis', required: false },
          { kind: 'capability', capability: 'boq_reconciliation', required: false },
          { kind: 'capability', capability: 'boq_five_step_pricing', required: false },
          { kind: 'capability', capability: 'execution_plan', required: false },
          { kind: 'capability', capability: 'schedule_resources', required: false },
          { kind: 'capability', capability: 'cost_cashflow', required: false },
        ],
        reviewSkillSlugs: ['tender-submission-audit', 'deliverable-reviewer'],
        reviewPolicy: 'risk-based',
        summaryDeliverable: {
          fileName: '投标提交合规与冻结记录.md',
          outlineZh: [
            '资格、评分、必交表单和签字盖章核对',
            '保函、保险、价格、BOQ 与技术方案一致性',
            '文件格式、份数、介质、命名和截止时间',
            '阻断项、未决项、责任人和冻结版本标识',
          ],
        },
        approvalGate: {
          promptZh: '请核对合规记录并确认是否冻结为最终提交版本。',
          approveLabelZh: '确认合规，冻结提交',
        },
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
        consumes: [],
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
        consumes: [{ kind: 'handoff', stageId: 'delivery-setup' }],
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
        consumes: [],
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
        consumes: [{ kind: 'handoff', stageId: 'investment-setup' }],
      },
    ],
  },
}
