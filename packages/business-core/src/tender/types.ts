export type TenderProjectStatus = 'active' | 'submitted' | 'awarded' | 'lost' | 'archived';

export type TenderDocumentKind =
  | 'notice'
  | 'tender_data'
  | 'contract_data'
  | 'scope'
  | 'specification'
  | 'drawing'
  | 'boq'
  | 'returnable_schedule'
  | 'addendum'
  | 'template'
  | 'supporting_evidence'
  | 'other';

export type TenderDocumentStatus = 'active' | 'superseded' | 'withdrawn';

export interface TenderSourceLocator {
  documentId: string;
  page?: number;
  sheet?: string;
  clause?: string;
  section?: string;
  cell?: string;
  blockId?: string;
  bbox?: [number, number, number, number];
  excerpt?: string;
}

export interface TenderProject {
  id: string;
  title: string;
  reference?: string;
  employer?: string;
  jurisdiction?: string;
  currency?: string;
  closingAt?: string;
  status: TenderProjectStatus;
}

export interface TenderDocument {
  id: string;
  name: string;
  path: string;
  kind: TenderDocumentKind;
  revision?: string;
  issuedAt?: string;
  sha256?: string;
  supersedesIds?: string[];
  status: TenderDocumentStatus;
}

export type TenderRequirementType =
  | 'mandatory'
  | 'qualification'
  | 'technical'
  | 'contractual'
  | 'pricing'
  | 'deadline'
  | 'format'
  | 'evaluated';

export type TenderRequirementCriticality = 'critical' | 'high' | 'normal';
export type TenderRequirementStatus = 'open' | 'planned' | 'compliant' | 'noncompliant' | 'blocked' | 'waived';

export interface TenderRequirement {
  id: string;
  title: string;
  text: string;
  type: TenderRequirementType;
  criticality: TenderRequirementCriticality;
  source: TenderSourceLocator;
  evidenceNeeded: string[];
  owner?: string;
  status: TenderRequirementStatus;
}

export type TenderCriterionMethod = 'pass_fail' | 'threshold' | 'weighted';
export type TenderCriterionStatus = 'open' | 'planned' | 'covered' | 'verified' | 'blocked';

export interface TenderEvaluationCriterion {
  id: string;
  title: string;
  method: TenderCriterionMethod;
  weight?: number;
  minimumScore?: number;
  requirementIds: string[];
  source: TenderSourceLocator;
  evidenceNeeded: string[];
  status: TenderCriterionStatus;
}

export type TenderDeliverableStatus = 'planned' | 'drafting' | 'ready' | 'blocked' | 'submitted';

export interface TenderDeliverable {
  id: string;
  title: string;
  format?: string;
  submissionSection?: string;
  dueAt?: string;
  templatePath?: string;
  requirementIds: string[];
  status: TenderDeliverableStatus;
}

export type TenderResponseStatus = 'planned' | 'drafting' | 'verified' | 'blocked';

export interface TenderResponsePlan {
  id: string;
  title: string;
  requirementIds: string[];
  criterionIds: string[];
  deliverableId?: string;
  nonDocumentResponseAccepted?: boolean;
  responseSection?: string;
  evidenceRefs: TenderSourceLocator[];
  evidenceArtifacts?: string[];
  owner?: string;
  status: TenderResponseStatus;
}

export interface TenderWorkspace {
  schemaVersion: 1;
  revision: number;
  project: TenderProject;
  documents: TenderDocument[];
  requirements: TenderRequirement[];
  criteria: TenderEvaluationCriterion[];
  deliverables: TenderDeliverable[];
  responses: TenderResponsePlan[];
}
