import { describe, expect, test } from 'bun:test';
import { parseTenderBoqFiveStepPricingData } from './schema.ts';

const skeleton = {
  currency: 'ZAR',
  pricingStatus: 'draft' as const,
  itemBuildUps: [],
  assumptions: [],
};

describe('tender BOQ five-step pricing data schema', () => {
  test('accepts the documented top-level object', () => {
    const parsed = parseTenderBoqFiveStepPricingData({
      ...skeleton,
      pricingStandard: 'c51_pure_direct_cost_v1',
      vatTreatment: 'exclusive',
      indirectCostPolicy: 'excluded_from_item_direct_cost',
    });
    expect(parsed.currency).toBe('ZAR');
    expect(parsed.itemBuildUps).toEqual([]);
    expect(parsed.resourceSummary).toEqual([]);
  });

  test('rejects guessed top-level keys the model has probed', () => {
    for (const extra of [{ rateBasis: {} }, { planningBasis: {} }, { sources: [] }]) {
      expect(() => parseTenderBoqFiveStepPricingData({ ...skeleton, ...extra })).toThrow();
    }
  });
});
