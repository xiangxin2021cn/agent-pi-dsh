import { auditTenderWorkspace } from '../../audit.ts';
import type { TenderWorkspace } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityIndex } from '../types.ts';
import { parseTenderCapabilityIndex } from '../schema.ts';
import { parseTenderSubmissionAuditData } from './schema.ts';
import type { TenderSubmissionAudit, TenderSubmissionAuditData } from './types.ts';

export function auditTenderSubmission(
  workspace: TenderWorkspace,
  capabilityIndexValue: TenderCapabilityIndex | unknown,
  value: TenderSubmissionAuditData | unknown,
  generatedAt = new Date().toISOString(),
): TenderSubmissionAudit {
  const capabilityIndex = parseTenderCapabilityIndex(capabilityIndexValue);
  const data = parseTenderSubmissionAuditData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const add = (issue: TenderCapabilityAuditIssue): void => { issues.push(issue); };
  const coreAudit = auditTenderWorkspace(workspace, generatedAt);
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const deliverableById = new Map(workspace.deliverables.map((deliverable) => [deliverable.id, deliverable]));
  const requirementIds = new Set(workspace.requirements.map((requirement) => requirement.id));
  const itemsByDeliverable = new Map<string, TenderSubmissionAuditData['items']>();

  if (coreAudit.readiness !== 'ready') {
    add({
      code: 'tender_workspace_not_ready',
      severity: 'error',
      entityType: 'project',
      entityId: workspace.project.id,
      message: `Tender Workspace readiness is ${coreAudit.readiness}.`,
    });
  }
  if (capabilityIndex.projectId !== workspace.project.id || capabilityIndex.coreRevision !== workspace.revision) {
    add({
      code: 'capability_index_stale',
      severity: 'error',
      entityType: 'project',
      entityId: workspace.project.id,
      message: 'Capability index does not match the current Tender Workspace revision.',
    });
  }

  const requiredPacks = capabilityIndex.capabilities.filter((entry) => entry.required && entry.capability !== 'submission_audit');
  for (const pack of requiredPacks) {
    if (!pack.enabled || pack.revision === 0 || pack.readiness === 'not_ready' || pack.stale) {
      add({
        code: 'required_capability_not_ready',
        severity: 'error',
        entityType: 'capability_pack',
        entityId: pack.capability,
        message: `Required capability ${pack.capability} is disabled, incomplete, not ready, or stale.`,
      });
    } else if (pack.readiness === 'needs_review') {
      add({
        code: 'required_capability_needs_review',
        severity: 'warning',
        entityType: 'capability_pack',
        entityId: pack.capability,
        message: `Required capability ${pack.capability} needs review.`,
      });
    }
  }

  for (const item of data.items) {
    const group = itemsByDeliverable.get(item.deliverableId) ?? [];
    group.push(item);
    itemsByDeliverable.set(item.deliverableId, group);
    const deliverable = deliverableById.get(item.deliverableId);
    if (!deliverable) {
      add({ code: 'submission_deliverable_missing', severity: 'error', entityType: 'submission_item', entityId: item.deliverableId, message: `Submission item references missing deliverable ${item.deliverableId}.` });
      continue;
    }
    if (deliverable.format && deliverable.format.toLowerCase() !== item.format.toLowerCase()) {
      add({ code: 'submission_format_mismatch', severity: 'error', entityType: 'submission_item', entityId: item.deliverableId, message: `Submission item format does not match required format ${deliverable.format}.` });
    }
    if (deliverable.templatePath && deliverable.templatePath !== item.templatePath) {
      add({ code: 'submission_template_mismatch', severity: 'error', entityType: 'submission_item', entityId: item.deliverableId, message: 'Submission item does not use the registered template.' });
    }
    if (item.validationStatus !== 'passed') {
      add({ code: 'submission_validation_failed', severity: 'error', entityType: 'submission_item', entityId: item.deliverableId, message: `Submission validation status is ${item.validationStatus}.` });
    }
    if (!item.checks.filePresent) addCheckIssue(add, 'submission_file_missing', item.deliverableId, 'Submission file is missing.');
    if (!item.checks.formatMatch) addCheckIssue(add, 'submission_format_check_failed', item.deliverableId, 'Submission format check failed.');
    if (!item.checks.templateMatch) addCheckIssue(add, 'submission_template_check_failed', item.deliverableId, 'Submission template check failed.');
    if (!item.checks.renderPassed) addCheckIssue(add, 'submission_render_failed', item.deliverableId, 'Submission render validation failed.');
    if (!item.checks.hashVerified) addCheckIssue(add, 'submission_hash_failed', item.deliverableId, 'Submission hash verification failed.');
    if (item.signatureStatus === 'missing') addCheckIssue(add, 'submission_signature_missing', item.deliverableId, 'Required signature is missing.');
    if (item.signatureStatus === 'present') {
      add({ code: 'submission_signature_unverified', severity: 'warning', entityType: 'submission_item', entityId: item.deliverableId, message: 'Signature is present but not verified.' });
    }
    for (const dependency of item.dependencies) {
      if (!deliverableById.has(dependency)) {
        add({ code: 'submission_dependency_missing', severity: 'error', entityType: 'submission_item', entityId: item.deliverableId, message: `Submission dependency ${dependency} is not a registered deliverable.` });
      }
    }
    inspectEvidence(item.evidenceRefs, item.deliverableId, documentById, add);
  }

  for (const deliverable of workspace.deliverables) {
    const items = itemsByDeliverable.get(deliverable.id) ?? [];
    if (items.length === 0) {
      add({ code: 'submission_item_missing', severity: 'error', entityType: 'deliverable', entityId: deliverable.id, message: `Deliverable ${deliverable.id} has no current submission item.` });
    } else if (items.length > 1) {
      add({ code: 'submission_item_duplicate', severity: 'error', entityType: 'deliverable', entityId: deliverable.id, message: `Deliverable ${deliverable.id} has ${items.length} current submission items.` });
    }
  }

  for (const contradiction of data.contradictions) {
    inspectEntityRefs(contradiction.deliverableIds, deliverableById, 'submission_contradiction_deliverable_missing', contradiction.id, add);
    for (const requirementId of contradiction.requirementIds) {
      if (!requirementIds.has(requirementId)) add({ code: 'submission_contradiction_requirement_missing', severity: 'error', entityType: 'contradiction', entityId: contradiction.id, message: `Contradiction references missing requirement ${requirementId}.` });
    }
    if (contradiction.status === 'open') add({ code: 'submission_contradiction_open', severity: 'error', entityType: 'contradiction', entityId: contradiction.id, message: contradiction.summary });
  }

  for (const finding of data.redTeamFindings) {
    inspectEntityRefs(finding.deliverableIds, deliverableById, 'red_team_deliverable_missing', finding.id, add);
    inspectEvidence(finding.evidenceRefs, finding.id, documentById, add);
    if (finding.insertedIntoFormalNarrative) add({ code: 'red_team_finding_in_formal_narrative', severity: 'error', entityType: 'red_team_finding', entityId: finding.id, message: 'Red-team finding was inserted into formal bid narrative.' });
    if (finding.status === 'open') {
      add({ code: 'red_team_finding_unresolved', severity: finding.severity === 'minor' ? 'warning' : 'error', entityType: 'red_team_finding', entityId: finding.id, message: `Open ${finding.severity} red-team finding: ${finding.title}.` });
    }
  }

  if (data.submissionStatus === 'blocked') add({ code: 'submission_blocked', severity: 'error', entityType: 'project', entityId: workspace.project.id, message: 'Submission assembly is blocked.' });
  if (data.submissionStatus === 'draft') add({ code: 'submission_not_reviewed', severity: 'warning', entityType: 'project', entityId: workspace.project.id, message: 'Submission assembly has not been reviewed.' });

  const readiness = issues.some((issue) => issue.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1,
    capability: 'submission_audit',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      requiredDeliverables: workspace.deliverables.length,
      submissionItems: data.items.length,
      passedSubmissionItems: data.items.filter((item) => item.validationStatus === 'passed' && Object.values(item.checks).every(Boolean)).length,
      openContradictions: data.contradictions.filter((item) => item.status === 'open').length,
      openRedTeamFindings: data.redTeamFindings.filter((item) => item.status === 'open').length,
      requiredCapabilityPacks: requiredPacks.length,
      readyRequiredCapabilityPacks: requiredPacks.filter((pack) => pack.enabled && pack.revision > 0 && pack.readiness === 'ready' && !pack.stale).length,
    },
    issues,
  };
}

function addCheckIssue(add: (issue: TenderCapabilityAuditIssue) => void, code: string, entityId: string, message: string): void {
  add({ code, severity: 'error', entityType: 'submission_item', entityId, message });
}

function inspectEvidence(
  refs: TenderSubmissionAuditData['items'][number]['evidenceRefs'],
  entityId: string,
  documentById: Map<string, TenderWorkspace['documents'][number]>,
  add: (issue: TenderCapabilityAuditIssue) => void,
): void {
  for (const ref of refs) {
    const document = documentById.get(ref.documentId);
    if (!document || document.status !== 'active') add({ code: 'submission_evidence_invalid', severity: 'error', entityType: 'submission_item', entityId, message: `Evidence document ${ref.documentId} is missing or inactive.` });
  }
}

function inspectEntityRefs<T>(
  ids: string[],
  entities: Map<string, T>,
  code: string,
  entityId: string,
  add: (issue: TenderCapabilityAuditIssue) => void,
): void {
  for (const id of ids) if (!entities.has(id)) add({ code, severity: 'error', entityType: 'submission_item', entityId, message: `Referenced deliverable ${id} is missing.` });
}
