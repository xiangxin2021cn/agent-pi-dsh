import type { TenderSourceLocator, TenderWorkspace } from './types.ts';

export type TenderReadiness = 'not_ready' | 'needs_review' | 'ready';
export type TenderAuditSeverity = 'error' | 'warning';

export interface TenderAuditIssue {
  code: string;
  severity: TenderAuditSeverity;
  entityType: 'project' | 'document' | 'requirement' | 'criterion' | 'deliverable' | 'response';
  entityId?: string;
  message: string;
}

export interface TenderReadinessAudit {
  schemaVersion: 1;
  projectId: string;
  workspaceRevision: number;
  generatedAt: string;
  readiness: TenderReadiness;
  summary: {
    documents: number;
    requirements: number;
    mandatoryRequirements: number;
    coveredMandatoryRequirements: number;
    criteria: number;
    coveredCriteria: number;
    weightedCriteriaWeight: number;
    coveredCriteriaWeight: number;
    deliverables: number;
    responses: number;
    verifiedResponses: number;
  };
  issues: TenderAuditIssue[];
}

export function auditTenderWorkspace(
  workspace: TenderWorkspace,
  generatedAt = new Date().toISOString(),
): TenderReadinessAudit {
  const issues: TenderAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const requirementIds = new Set(workspace.requirements.map((requirement) => requirement.id));
  const criterionIds = new Set(workspace.criteria.map((criterion) => criterion.id));
  const deliverableIds = new Set(workspace.deliverables.map((deliverable) => deliverable.id));

  const addIssue = (issue: TenderAuditIssue): void => {
    issues.push(issue);
  };

  if (workspace.documents.length === 0) {
    addIssue({
      code: 'no_source_documents',
      severity: 'error',
      entityType: 'project',
      entityId: workspace.project.id,
      message: 'No tender source documents are registered.',
    });
  }
  if (workspace.requirements.length === 0) {
    addIssue({
      code: 'no_requirements_registered',
      severity: 'error',
      entityType: 'project',
      entityId: workspace.project.id,
      message: 'No tender requirements are registered.',
    });
  }

  const inspectSource = (
    source: TenderSourceLocator,
    entityType: TenderAuditIssue['entityType'],
    entityId: string,
  ): void => {
    const document = documentById.get(source.documentId);
    if (!document) {
      addIssue({
        code: 'broken_document_reference',
        severity: 'error',
        entityType,
        entityId,
        message: `Source document ${source.documentId} is not registered.`,
      });
      return;
    }
    if (document.status === 'superseded') {
      addIssue({
        code: 'superseded_source_reference',
        severity: 'warning',
        entityType,
        entityId,
        message: `Source document ${source.documentId} is superseded.`,
      });
    }
  };

  for (const document of workspace.documents) {
    for (const supersededId of document.supersedesIds ?? []) {
      if (!documentById.has(supersededId)) {
        addIssue({
          code: 'broken_document_reference',
          severity: 'error',
          entityType: 'document',
          entityId: document.id,
          message: `Superseded document ${supersededId} is not registered.`,
        });
      }
    }
  }

  for (const requirement of workspace.requirements) {
    inspectSource(requirement.source, 'requirement', requirement.id);
    if (requirement.criticality === 'critical' && ['blocked', 'noncompliant'].includes(requirement.status)) {
      addIssue({
        code: 'critical_requirement_blocked',
        severity: 'error',
        entityType: 'requirement',
        entityId: requirement.id,
        message: `Critical requirement ${requirement.id} is ${requirement.status}.`,
      });
    }
  }

  for (const criterion of workspace.criteria) {
    inspectSource(criterion.source, 'criterion', criterion.id);
    for (const requirementId of criterion.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        addIssue({
          code: 'broken_entity_reference',
          severity: 'error',
          entityType: 'criterion',
          entityId: criterion.id,
          message: `Criterion references missing requirement ${requirementId}.`,
        });
      }
    }
  }

  for (const deliverable of workspace.deliverables) {
    if (deliverable.requirementIds.length === 0) {
      addIssue({
        code: 'deliverable_unlinked',
        severity: 'warning',
        entityType: 'deliverable',
        entityId: deliverable.id,
        message: `Deliverable ${deliverable.id} is not linked to a requirement.`,
      });
    }
    for (const requirementId of deliverable.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        addIssue({
          code: 'broken_entity_reference',
          severity: 'error',
          entityType: 'deliverable',
          entityId: deliverable.id,
          message: `Deliverable references missing requirement ${requirementId}.`,
        });
      }
    }
  }

  for (const response of workspace.responses) {
    for (const requirementId of response.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        addIssue({
          code: 'broken_entity_reference',
          severity: 'error',
          entityType: 'response',
          entityId: response.id,
          message: `Response references missing requirement ${requirementId}.`,
        });
      }
    }
    for (const criterionId of response.criterionIds) {
      if (!criterionIds.has(criterionId)) {
        addIssue({
          code: 'broken_entity_reference',
          severity: 'error',
          entityType: 'response',
          entityId: response.id,
          message: `Response references missing criterion ${criterionId}.`,
        });
      }
    }
    if (response.deliverableId && !deliverableIds.has(response.deliverableId)) {
      addIssue({
        code: 'broken_entity_reference',
        severity: 'error',
        entityType: 'response',
        entityId: response.id,
        message: `Response references missing deliverable ${response.deliverableId}.`,
      });
    }
    if (
      response.requirementIds.length > 0
      && !response.deliverableId
      && response.nonDocumentResponseAccepted !== true
    ) {
      addIssue({
        code: 'response_delivery_unresolved',
        severity: 'error',
        entityType: 'response',
        entityId: response.id,
        message: `Response ${response.id} has no deliverable and is not accepted as a non-document response.`,
      });
    }
    for (const source of response.evidenceRefs) {
      inspectSource(source, 'response', response.id);
    }
    if (
      response.status === 'verified'
      && response.evidenceRefs.length === 0
      && (response.evidenceArtifacts?.length ?? 0) === 0
    ) {
      addIssue({
        code: 'verified_response_missing_evidence',
        severity: 'error',
        entityType: 'response',
        entityId: response.id,
        message: `Verified response ${response.id} has no evidence.`,
      });
    }
  }

  const activeResponses = workspace.responses.filter((response) => response.status !== 'blocked');
  const requirementCoverageResponses = activeResponses.filter((response) =>
    Boolean(response.deliverableId) || response.nonDocumentResponseAccepted === true,
  );
  const coveredRequirementIds = new Set(requirementCoverageResponses.flatMap((response) => response.requirementIds));
  const coveredCriterionIds = new Set(activeResponses.flatMap((response) => response.criterionIds));
  const mandatoryRequirements = workspace.requirements.filter((requirement) => requirement.type === 'mandatory');

  for (const requirement of mandatoryRequirements) {
    if (!coveredRequirementIds.has(requirement.id)) {
      addIssue({
        code: 'mandatory_requirement_uncovered',
        severity: 'error',
        entityType: 'requirement',
        entityId: requirement.id,
        message: `Mandatory requirement ${requirement.id} has no response plan.`,
      });
    }
  }

  for (const criterion of workspace.criteria) {
    if (!coveredCriterionIds.has(criterion.id)) {
      addIssue({
        code: 'evaluation_criterion_uncovered',
        severity: 'error',
        entityType: 'criterion',
        entityId: criterion.id,
        message: `Evaluation criterion ${criterion.id} has no response plan.`,
      });
    }
  }

  const weightedCriteria = workspace.criteria.filter((criterion) => criterion.method === 'weighted');
  const readiness: TenderReadiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    projectId: workspace.project.id,
    workspaceRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      documents: workspace.documents.length,
      requirements: workspace.requirements.length,
      mandatoryRequirements: mandatoryRequirements.length,
      coveredMandatoryRequirements: mandatoryRequirements.filter((requirement) => coveredRequirementIds.has(requirement.id)).length,
      criteria: workspace.criteria.length,
      coveredCriteria: workspace.criteria.filter((criterion) => coveredCriterionIds.has(criterion.id)).length,
      weightedCriteriaWeight: weightedCriteria.reduce((sum, criterion) => sum + (criterion.weight ?? 0), 0),
      coveredCriteriaWeight: weightedCriteria
        .filter((criterion) => coveredCriterionIds.has(criterion.id))
        .reduce((sum, criterion) => sum + (criterion.weight ?? 0), 0),
      deliverables: workspace.deliverables.length,
      responses: workspace.responses.length,
      verifiedResponses: workspace.responses.filter((response) => response.status === 'verified').length,
    },
    issues,
  };
}
