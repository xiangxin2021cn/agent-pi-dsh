export type ProcurementContext = 'government_procurement' | 'enterprise_procurement' | 'unknown';
export type ProcurementSubject = 'construction' | 'engineering_goods' | 'engineering_services' | 'goods' | 'services' | 'unknown';

export interface ChinaTenderProfile {
  context: ProcurementContext;
  subject: ProcurementSubject;
  method: 'tender' | 'non_tender' | 'unknown';
  mandatoryTender?: 'yes' | 'no' | 'unknown';
  province?: string;
  industry?: string;
  projectDate?: string;
}

export interface LegalSource {
  title: string;
  url: string;
  article?: string;
}

export interface ProfileAssessment {
  advisoryOnly: true;
  procedure: 'tendering_law' | 'government_procurement_law' | 'enterprise_rules' | 'undetermined';
  governmentProcurementPolicies: boolean | 'unknown';
  missing: string[];
  reasons: string[];
  sources: LegalSource[];
}

export interface ChinaTenderRule {
  id: string;
  title: string;
  status: 'effective' | 'pending' | 'draft' | 'repealed';
  effectiveFrom?: string;
  effectiveTo?: string;
  checkedAt: string;
  source: LegalSource;
  provinces?: string[];
  industries?: string[];
  contexts?: Exclude<ProcurementContext, 'unknown'>[];
  subjects?: Exclude<ProcurementSubject, 'unknown'>[];
  methods?: ('tender' | 'non_tender')[];
  mandatoryTenderOnly?: boolean;
}

export interface RuleAssessment {
  ruleId: string;
  status: 'applicable' | 'not_applicable' | 'needs_review';
  eligibleForCheck: boolean;
  reasons: string[];
  source: LegalSource;
}

export interface ChinaTenderSource {
  documentId: string;
  status: 'active' | 'superseded' | 'withdrawn';
  sha256?: string;
  page?: number;
  clause?: string;
  excerpt?: string;
}

export interface ChinaTenderRequirement {
  id: string;
  title: string;
  category: 'qualification' | 'mandatory' | 'scored' | 'technical' | 'pricing' | 'format' | 'other';
  source: ChinaTenderSource;
  ruleId?: string;
  evaluationDate?: string;
}

export interface ChinaTenderEvidence {
  id: string;
  source: ChinaTenderSource;
  verification: 'verified' | 'unverified' | 'not_found';
  validFrom?: string;
  validUntil?: string;
  checkedAt?: string;
}

export interface ChinaTenderResponse {
  requirementId: string;
  evidenceIds: string[];
  assessment: 'supports' | 'contradicts' | 'unknown';
  responseLocation?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  requirementSourceSha256?: string;
}

export interface ChinaTenderResponseResult {
  requirementId: string;
  title: string;
  status: 'supported' | 'conflict' | 'needs_evidence' | 'needs_review';
  reasons: string[];
  source: ChinaTenderSource;
  evidenceIds: string[];
  responseLocation?: string;
}

export interface BoqBaselineRow {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: string;
  features?: string;
  fixedAmount?: string;
}

export interface BoqBaselineSource {
  documentId: string;
  sha256: string;
  revision?: string;
  issuedAt?: string;
}

export interface ChinaBoqBaseline {
  readonly schemaVersion: 1;
  readonly baselineId: string;
  readonly source: Readonly<BoqBaselineSource>;
  readonly rows: readonly Readonly<BoqBaselineRow>[];
  readonly fingerprint: string;
}

export interface BoqDifference {
  rowId: string;
  kind: 'added' | 'missing' | 'changed';
  fields: string[];
  baselineQuantity?: string;
  comparedQuantity?: string;
  quantityDelta?: string;
}

export interface ChinaBoqComparison {
  baselineId: string;
  baselineFingerprint: string;
  kind: 'recalculation' | 'submission';
  status: 'unchanged' | 'needs_review';
  differences: BoqDifference[];
  note: string;
}

export interface ChinaTenderInput {
  profile: ChinaTenderProfile;
  rules?: ChinaTenderRule[];
  requirements?: ChinaTenderRequirement[];
  evidence?: ChinaTenderEvidence[];
  responses?: ChinaTenderResponse[];
  boq?: {
    baseline: ChinaBoqBaseline;
    comparedRows: BoqBaselineRow[];
    kind: 'recalculation' | 'submission';
  };
}
