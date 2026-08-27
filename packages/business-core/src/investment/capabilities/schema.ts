import { z } from 'zod';
import { InvestmentEvidenceRefSchema } from '../schema.ts';
import type { InvestmentCapabilityData, InvestmentCapabilityEnvelope, InvestmentCapabilityIndex } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);
const Decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const CapabilityId = z.enum(['mandate_screening', 'resource_technical', 'market_offtake', 'legal_esg', 'financial_valuation', 'transaction_decision']);
const Dependency = z.union([z.literal('core'), CapabilityId]);

export const InvestmentCapabilityDataSchema = z.object({
  reviewStatus: z.enum(['draft', 'reviewed', 'blocked']),
  findings: uniqueById(z.object({
    id: EntityId, category: EntityId, title: Text, conclusion: Text,
    evidenceRefs: z.array(InvestmentEvidenceRefSchema),
    status: z.enum(['verified', 'draft', 'blocked']),
    confidence: z.enum(['confirmed', 'scenario', 'unverified']),
  })),
  assumptions: uniqueById(z.object({
    id: EntityId, name: Text, value: Text, unit: Text.optional(),
    evidenceRefs: z.array(InvestmentEvidenceRefSchema), status: z.enum(['approved', 'draft', 'blocked']),
  })),
  metrics: uniqueById(z.object({
    id: EntityId, name: Text, value: Decimal, unit: Text,
    evidenceRefs: z.array(InvestmentEvidenceRefSchema), status: z.enum(['verified', 'scenario', 'unverified']),
  })),
  risks: uniqueById(z.object({
    id: EntityId, title: Text, severity: z.enum(['low', 'medium', 'high', 'critical']),
    owner: Text, mitigation: Text, status: z.enum(['open', 'mitigated', 'blocked']),
  })),
  scenarios: uniqueById(z.object({
    id: EntityId, name: Text, status: z.enum(['draft', 'reviewed']),
    assumptionIds: z.array(EntityId), metricIds: z.array(EntityId),
  })),
  approvals: uniqueById(z.object({
    id: EntityId, title: Text, authority: Text, decision: z.enum(['pending', 'approved', 'rejected']),
    decidedAt: z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value))).optional(),
    evidenceRefs: z.array(InvestmentEvidenceRefSchema),
  })),
});

export const InvestmentCapabilityEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), capability: CapabilityId, projectId: EntityId,
  revision: z.number().int().positive(), coreRevision: z.number().int().nonnegative(),
  upstream: z.array(z.object({ capability: Dependency, revision: z.number().int().nonnegative() })),
  updatedAt: z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value))),
  data: InvestmentCapabilityDataSchema,
});

export const InvestmentCapabilityIndexSchema = z.object({
  schemaVersion: z.literal(1), projectId: EntityId, coreRevision: z.number().int().nonnegative(),
  capabilities: z.array(z.object({
    capability: CapabilityId, enabled: z.boolean(), required: z.boolean(), revision: z.number().int().nonnegative(),
    readiness: z.enum(['not_ready', 'needs_review', 'ready']), issueCount: z.number().int().nonnegative(),
    stale: z.boolean(), updatedAt: z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value))),
  })),
});

export function parseInvestmentCapabilityData(value: unknown): InvestmentCapabilityData {
  return InvestmentCapabilityDataSchema.parse(value) as InvestmentCapabilityData;
}

export function parseInvestmentCapabilityEnvelope(value: unknown): InvestmentCapabilityEnvelope {
  return InvestmentCapabilityEnvelopeSchema.parse(value) as InvestmentCapabilityEnvelope;
}

export function parseInvestmentCapabilityIndex(value: unknown): InvestmentCapabilityIndex {
  return InvestmentCapabilityIndexSchema.parse(value) as InvestmentCapabilityIndex;
}

function uniqueById<T extends z.ZodType<{ id: string }>>(schema: T) {
  return z.array(schema).superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate entity ID: ${item.id}` });
      seen.add(item.id);
    });
  });
}
