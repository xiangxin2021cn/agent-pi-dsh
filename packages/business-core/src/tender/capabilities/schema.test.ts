import { describe, expect, test } from 'bun:test';

describe('tender capability envelope schema', () => {
  test('parses a versioned capability envelope', async () => {
    const tender = await import('../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderCapabilityEnvelope).toBe('function');

    const parsed = (tender.parseTenderCapabilityEnvelope as (value: unknown) => any)({
      schemaVersion: 1,
      capability: 'evaluation_strategy',
      projectId: 'n3-upgrade',
      revision: 1,
      coreRevision: 4,
      upstream: [{ capability: 'core', revision: 4 }],
      updatedAt: '2026-07-12T10:00:00.000Z',
      data: { strategies: [] },
    });

    expect(parsed.capability).toBe('evaluation_strategy');
    expect(parsed.upstream).toEqual([{ capability: 'core', revision: 4 }]);
  });

  test('rejects duplicate upstream revision references', async () => {
    const tender = await import('../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderCapabilityEnvelope).toBe('function');

    expect(() => (tender.parseTenderCapabilityEnvelope as (value: unknown) => unknown)({
      schemaVersion: 1,
      capability: 'evaluation_strategy',
      projectId: 'n3-upgrade',
      revision: 1,
      coreRevision: 4,
      upstream: [
        { capability: 'core', revision: 4 },
        { capability: 'core', revision: 4 },
      ],
      updatedAt: '2026-07-12T10:00:00.000Z',
      data: { strategies: [] },
    })).toThrow(/Duplicate upstream capability/);
  });
});
