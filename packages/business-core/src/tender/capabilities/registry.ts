import type {
  TenderCapabilityDependency,
  TenderCapabilityEnvelope,
  TenderCapabilityId,
} from './types.ts';

const STATIC_DEPENDENCIES: Record<Exclude<TenderCapabilityId, 'submission_audit'>, TenderCapabilityDependency[]> = {
  document_analysis: ['core'],
  evaluation_strategy: ['core', 'document_analysis'],
  boq_reconciliation: ['core', 'document_analysis'],
  project_boundary: ['core', 'document_analysis'],
  boq_five_step_pricing: ['core', 'document_analysis', 'boq_reconciliation'],
  construction_resource_schedule: ['core', 'boq_five_step_pricing'],
  bidder_commitments: ['core', 'document_analysis', 'boq_five_step_pricing'],
  execution_plan: ['core', 'document_analysis', 'boq_reconciliation', 'boq_five_step_pricing', 'bidder_commitments'],
  schedule_resources: ['core', 'execution_plan', 'boq_five_step_pricing'],
  cost_cashflow: ['core', 'boq_reconciliation', 'boq_five_step_pricing', 'schedule_resources'],
  submission_documents: ['core', 'execution_plan', 'schedule_resources', 'cost_cashflow'],
};

export function getTenderCapabilityDependencies(
  capability: TenderCapabilityId,
  enabledCapabilities: TenderCapabilityId[] = [],
): TenderCapabilityDependency[] {
  if (capability !== 'submission_audit') return [...STATIC_DEPENDENCIES[capability]];
  return [
    'core',
    ...enabledCapabilities.filter((candidate) => candidate !== 'submission_audit'),
  ];
}

export function isTenderCapabilityStale(
  envelope: TenderCapabilityEnvelope,
  currentCoreRevision: number,
  capabilityRevisions: Partial<Record<TenderCapabilityId, number>>,
): boolean {
  if (envelope.coreRevision !== currentCoreRevision) return true;

  return envelope.upstream.some((reference) => {
    if (reference.capability === 'core') return reference.revision !== currentCoreRevision;
    return capabilityRevisions[reference.capability] !== reference.revision;
  });
}
