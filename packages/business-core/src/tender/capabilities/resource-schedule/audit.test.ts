import { describe, expect, test } from 'bun:test';
import type { TenderWorkspace } from '../../types.ts';
import { auditTenderConstructionResourceSchedule } from './audit.ts';
import { parseTenderConstructionResourceScheduleData } from './schema.ts';

const workspace: TenderWorkspace = {
  schemaVersion: 1,
  revision: 2,
  project: { id: 'n3', title: 'N3 Tender', status: 'active' },
  documents: [],
  requirements: [],
  criteria: [],
  deliverables: [],
  responses: [],
};

describe('construction resource schedule', () => {
  test('parses and audits a non-empty schedule', () => {
    const data = parseTenderConstructionResourceScheduleData({
      currency: 'ZAR',
      rows: [{
        id: 'diesel',
        category: 'material',
        name: 'Diesel',
        unit: 'L',
        totalQuantity: '1200',
        unitRate: '23.5',
        currency: 'ZAR',
        sourceBoqItemIds: ['item-1'],
        assumptionStatus: 'sourced',
        sourceRefs: [{ documentId: 'quote', page: 1 }],
      }],
    });
    const audit = auditTenderConstructionResourceSchedule(workspace, data, {
      schemaVersion: 1,
      projectId: 'n3',
      coreRevision: 1,
      capabilities: [],
    });
    expect(audit.readiness).toBe('ready');
    expect(audit.summary.rows).toBe(1);
  });

  test('empty rows fail parse', () => {
    expect(() => parseTenderConstructionResourceScheduleData({ rows: [] })).toThrow();
  });
});
