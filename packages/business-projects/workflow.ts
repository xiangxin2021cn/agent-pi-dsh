import type { TenderCapabilityId } from '../business-core/src/tender/index.ts'

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
  /** Default durable project objective; a project may override it. */
  projectGoal?: string
  /** Default terminal outcomes shown in every stage transaction. */
  terminalDeliverables?: string[]
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

