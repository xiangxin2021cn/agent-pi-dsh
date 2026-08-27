import { describe, expect, test } from 'bun:test';

describe('exact tender cost decimal arithmetic', () => {
  test('multiplies decimal quantity and rate without floating point drift', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.multiplyDecimalStrings).toBe('function');

    expect((tender.multiplyDecimalStrings as (left: string, right: string) => string)('1250.5', '10.25'))
      .toBe('12817.625');
  });

  test('adds decimal totals with different scales exactly', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.sumDecimalStrings).toBe('function');

    expect((tender.sumDecimalStrings as (values: string[]) => string)(['0.1', '0.20', '12817.625']))
      .toBe('12817.925');
  });

  test('compares decimal values with different scales exactly', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.compareDecimalStrings).toBe('function');

    const compare = tender.compareDecimalStrings as (left: string, right: string) => number;
    expect(compare('10.00', '10')).toBe(0);
    expect(compare('10.01', '10')).toBe(1);
    expect(compare('9.99', '10')).toBe(-1);
  });
});
