import { describe, expect, test } from 'bun:test';

describe('delivery capability registry', () => {
  test('keeps delivery pack dependencies independent from tender and investment', async () => {
    const delivery = await import('../index.ts') as Record<string, unknown>;
    expect(typeof delivery.getDeliveryCapabilityDependencies).toBe('function');
    const getDependencies = delivery.getDeliveryCapabilityDependencies as Function;

    expect(getDependencies('contract_scope')).toEqual(['core']);
    expect(getDependencies('programme_progress')).toEqual(['core', 'contract_scope']);
    expect(getDependencies('resource_procurement')).toEqual(['core', 'contract_scope', 'programme_progress']);
    expect(getDependencies('cost_commercial')).toEqual(['core', 'contract_scope', 'resource_procurement']);
    expect(getDependencies('cashflow')).toEqual(['core', 'programme_progress', 'cost_commercial']);
    expect(getDependencies('risk_change')).toEqual(['core', 'contract_scope']);
    expect(getDependencies('reporting_audit', ['contract_scope', 'risk_change', 'reporting_audit'])).toEqual([
      'core', 'contract_scope', 'risk_change',
    ]);
  });
});
