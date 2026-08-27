import type { DeliveryCapabilityDependency, DeliveryCapabilityEnvelope, DeliveryCapabilityId } from './types.ts';

const DEPENDENCIES: Record<Exclude<DeliveryCapabilityId, 'reporting_audit'>, DeliveryCapabilityDependency[]> = {
  contract_scope: ['core'],
  programme_progress: ['core', 'contract_scope'],
  resource_procurement: ['core', 'contract_scope', 'programme_progress'],
  cost_commercial: ['core', 'contract_scope', 'resource_procurement'],
  cashflow: ['core', 'programme_progress', 'cost_commercial'],
  risk_change: ['core', 'contract_scope'],
};

export function getDeliveryCapabilityDependencies(
  capability: DeliveryCapabilityId,
  enabledCapabilities: DeliveryCapabilityId[] = [],
): DeliveryCapabilityDependency[] {
  if (capability !== 'reporting_audit') return [...DEPENDENCIES[capability]];
  return ['core', ...enabledCapabilities.filter((candidate) => candidate !== 'reporting_audit')];
}

export function isDeliveryCapabilityStale(
  envelope: DeliveryCapabilityEnvelope,
  currentCoreRevision: number,
  capabilityRevisions: Partial<Record<DeliveryCapabilityId, number>>,
): boolean {
  if (envelope.coreRevision !== currentCoreRevision) return true;
  return envelope.upstream.some((reference) =>
    reference.capability === 'core'
      ? reference.revision !== currentCoreRevision
      : capabilityRevisions[reference.capability] !== reference.revision,
  );
}
