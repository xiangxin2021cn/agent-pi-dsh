import type { TenderWorkspace } from '../../types.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { parseTenderProjectBoundaryPack } from './schema.ts';
import {
  organizationOutlineMeetsMinimum,
  type TenderProjectBoundaryAudit,
  type TenderProjectBoundaryPack,
} from './types.ts';

export function auditTenderProjectBoundary(
  workspace: TenderWorkspace,
  value: TenderProjectBoundaryPack | unknown,
  generatedAt = new Date().toISOString(),
): TenderProjectBoundaryAudit {
  const data = parseTenderProjectBoundaryPack(value);
  const issues: TenderCapabilityAuditIssue[] = [];

  if (data.projectId !== workspace.project.id) {
    issues.push({
      code: 'project_boundary_project_mismatch',
      severity: 'error',
      entityType: 'project_boundary',
      message: `Project boundary projectId ${data.projectId} does not match workspace ${workspace.project.id}.`,
    });
  }

  const outline = data.organizationOutline.text.trim();
  const outlineMeetsMinimum = organizationOutlineMeetsMinimum(outline);
  if (!outline) {
    issues.push({
      code: 'project_boundary_outline_empty',
      severity: 'error',
      entityType: 'organization_outline',
      message: 'Organization outline is required before BOQ pricing.',
    });
  } else if (!outlineMeetsMinimum) {
    issues.push({
      code: 'project_boundary_outline_short',
      severity: 'error',
      entityType: 'organization_outline',
      message: 'Organization outline is below the soft minimum length for a usable project boundary.',
    });
  }

  if (!data.standards.measurementStandard.id.trim() && !data.standards.measurementStandard.title.trim()) {
    issues.push({
      code: 'project_boundary_measurement_missing',
      severity: 'error',
      entityType: 'measurement_standard',
      message: 'Measurement standard id or title is required.',
    });
  }

  if (!data.pricing.pricingStandard.trim()) {
    issues.push({
      code: 'project_boundary_pricing_standard_missing',
      severity: 'error',
      entityType: 'pricing',
      message: 'pricingStandard must be selected (profile default allowed).',
    });
  }

  if (!data.jurisdiction.currency.trim()) {
    issues.push({
      code: 'project_boundary_currency_missing',
      severity: 'error',
      entityType: 'jurisdiction',
      message: 'Project currency is required.',
    });
  }

  if (!data.bidderResources.outline.trim()) {
    issues.push({
      code: 'project_boundary_bidder_resources_empty',
      severity: 'warning',
      entityType: 'bidder_resources',
      message: 'Bidder resources outline is empty; BOQ may lack owned-plant / labour assumptions.',
    });
  }

  if (!data.humanConfirmedAt && data.readiness === 'ready') {
    issues.push({
      code: 'project_boundary_unconfirmed_ready',
      severity: 'warning',
      entityType: 'project_boundary',
      message: 'Boundary marked ready without humanConfirmedAt.',
    });
  }

  if (data.readiness === 'draft') {
    issues.push({
      code: 'project_boundary_draft',
      severity: 'warning',
      entityType: 'project_boundary',
      message: 'Project boundary is still draft; confirm before relying on BOQ briefs.',
    });
  }

  const sources = data.boundarySources ?? [];
  if (sources.length === 0) {
    issues.push({
      code: 'project_boundary_no_sources',
      severity: 'warning',
      entityType: 'boundary_sources',
      message: 'No knowledge-standard, tender-spec, or bidder-resource sources registered; BOQ fence will be outline-only.',
    });
  }
  if (sources.some((source) => source.parseStatus === 'failed')) {
    issues.push({
      code: 'project_boundary_parse_failed',
      severity: 'error',
      entityType: 'boundary_sources',
      message: 'One or more boundary sources failed to parse.',
    });
  }
  if (sources.some((source) => source.parseStatus === 'registered' && Boolean(source.path))) {
    issues.push({
      code: 'project_boundary_parse_pending',
      severity: 'warning',
      entityType: 'boundary_sources',
      message: 'Registered boundary files still need a parse memo before confirmation.',
    });
  }

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'project_boundary',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      profileId: data.profileId ?? null,
      currency: data.jurisdiction.currency,
      pricingStandard: data.pricing.pricingStandard,
      measurementStandard: data.standards.measurementStandard.title || data.standards.measurementStandard.id,
      outlineChars: outline.length,
      outlineMeetsMinimum,
      humanConfirmed: Boolean(data.humanConfirmedAt),
      sourceCount: sources.length,
      parsedSourceCount: sources.filter((source) => source.parseStatus === 'parsed' || source.parseStatus === 'not_required').length,
    },
    issues,
  };
}
