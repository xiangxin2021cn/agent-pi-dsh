import type { InvestmentCapabilityDependency, InvestmentCapabilityEnvelope, InvestmentCapabilityId } from './types.ts';

const DEPENDENCIES: Record<InvestmentCapabilityId, InvestmentCapabilityDependency[]> = {
  mandate_screening: ['core'],
  resource_technical: ['core', 'mandate_screening'],
  market_offtake: ['core', 'mandate_screening'],
  legal_esg: ['core', 'mandate_screening'],
  financial_valuation: ['core', 'resource_technical', 'market_offtake', 'legal_esg'],
  transaction_decision: ['core', 'financial_valuation'],
};

export function getInvestmentCapabilityDependencies(capability: InvestmentCapabilityId): InvestmentCapabilityDependency[] {
  return [...DEPENDENCIES[capability]];
}

export function isInvestmentCapabilityStale(
  envelope: InvestmentCapabilityEnvelope,
  currentCoreRevision: number,
  capabilityRevisions: Partial<Record<InvestmentCapabilityId, number>>,
): boolean {
  if (envelope.coreRevision !== currentCoreRevision) return true;
  return envelope.upstream.some((reference) => reference.capability === 'core'
    ? reference.revision !== currentCoreRevision
    : capabilityRevisions[reference.capability] !== reference.revision);
}
