import { z } from 'zod';
import { DeliveryEvidenceRefSchema } from '../../schema.ts';
import type { DeliveryReportingAuditData } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const IsoDate = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'Expected an ISO date.',
);
const IsoDateTime = z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value)));
const Period = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
const Capability = z.enum(['contract_scope', 'programme_progress', 'resource_procurement', 'cost_commercial', 'cashflow', 'risk_change']);

export const DeliveryReportingAuditDataSchema = z.object({
  controlStatus: z.enum(['draft', 'reviewed', 'blocked']),
  period: Period,
  dataDate: IsoDate,
  capabilityAttestations: z.array(z.object({
    capability: Capability,
    status: z.enum(['reviewed', 'exception', 'not_applicable']),
    note: Text,
  })).default([]),
  varianceExplanations: z.array(z.object({
    id: EntityId, capability: Capability, metric: Text, baseline: Text, actual: Text, variance: Text,
    explanation: Text, owner: Text, evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'reviewed', 'blocked']),
  })).default([]),
  managementReports: z.array(z.object({
    id: EntityId, title: Text, format: z.enum(['md', 'docx', 'pdf', 'xlsx', 'json']), artifactPath: Text,
    contentSha256: Sha256, capabilityIds: z.array(Capability).min(1),
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]), status: z.enum(['draft', 'reviewed', 'approved', 'blocked']),
  })).default([]),
  closeApproval: z.object({
    status: z.enum(['pending', 'approved', 'rejected']), approvedBy: Text.optional(), approvedAt: IsoDate.optional(),
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
  }),
  auditHistory: z.array(z.object({
    id: EntityId, action: Text, actor: Text, at: IsoDateTime, previousHash: Sha256.optional(), contentHash: Sha256,
  })).default([]),
});

export function parseDeliveryReportingAuditData(value: unknown): DeliveryReportingAuditData {
  return DeliveryReportingAuditDataSchema.parse(value) as DeliveryReportingAuditData;
}
