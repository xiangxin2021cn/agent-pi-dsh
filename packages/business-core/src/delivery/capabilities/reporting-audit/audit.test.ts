import { describe, expect, test } from 'bun:test';

const capabilityIds = ['contract_scope', 'programme_progress', 'resource_procurement', 'cost_commercial', 'cashflow', 'risk_change'];

function workspace(): any {
  return {
    schemaVersion: 1, revision: 12,
    project: { id: 'n3-delivery', title: 'N3 Delivery', currency: 'ZAR', status: 'active', dataDate: '2026-07-12' },
    sources: [{ id: 'period-report', name: 'Period Report Evidence', path: 'C:/report.xlsx', kind: 'supporting_evidence', status: 'active', sha256: 'a'.repeat(64) }],
    snapshots: [], baselines: [], knowledgeUses: [],
  };
}

function upstreamData(): any {
  return Object.fromEntries(capabilityIds.map((capability) => [capability, { controlStatus: 'reviewed' }]));
}

function completeData(): any {
  const evidenceRefs = [{ kind: 'source', sourceId: 'period-report', sheet: 'Summary', cell: 'B2:H2' }];
  return {
    controlStatus: 'reviewed', period: '2026-07', dataDate: '2026-07-12',
    capabilityAttestations: capabilityIds.map((capability) => ({ capability, status: 'reviewed', note: 'Reviewed for period close' })),
    varianceExplanations: [{ id: 'schedule-variance', capability: 'programme_progress', metric: 'Forecast finish', baseline: '2026-07-20', actual: '2026-07-22', variance: '2 days', explanation: 'Utility interface', owner: 'Project Manager', evidenceRefs, status: 'reviewed' }],
    managementReports: [{ id: 'monthly-report', title: 'Monthly Management Report', format: 'docx', artifactPath: 'reports/2026-07.docx', contentSha256: 'b'.repeat(64), capabilityIds, evidenceRefs, status: 'approved' }],
    closeApproval: { status: 'approved', approvedBy: 'Project Director', approvedAt: '2026-07-13', evidenceRefs },
    auditHistory: [
      { id: 'event-1', action: 'prepared', actor: 'Project Controls Manager', at: '2026-07-12T10:00:00.000Z', contentHash: 'c'.repeat(64) },
      { id: 'event-2', action: 'approved', actor: 'Project Director', at: '2026-07-13T10:00:00.000Z', previousHash: 'c'.repeat(64), contentHash: 'd'.repeat(64) },
    ],
  };
}

describe('delivery reporting and audit capability', () => {
  test('is ready for approved period close across all enabled delivery capabilities', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof delivery.auditDeliveryReportingAudit).toBe('function');
    const audit = (delivery.auditDeliveryReportingAudit as Function)(workspace(), upstreamData(), completeData(), '2026-07-13T20:00:00.000Z');
    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.attestedCapabilities).toBe(6);
    expect(audit.summary.approvedReports).toBe(1);
  });

  test('blocks missing capability attestation, report coverage, and close approval', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.capabilityAttestations = data.capabilityAttestations.filter((item: { capability: string }) => item.capability !== 'cashflow');
    data.managementReports[0].capabilityIds = ['contract_scope'];
    data.closeApproval = { status: 'pending', evidenceRefs: [] };
    const audit = (delivery.auditDeliveryReportingAudit as Function)(workspace(), upstreamData(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('capability_attestation_missing');
    expect(codes).toContain('management_report_capability_missing');
    expect(codes).toContain('period_close_not_approved');
    expect(audit.readiness).toBe('not_ready');
  });

  test('blocks broken audit chain and unsupported approved reports', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.auditHistory[1].previousHash = 'e'.repeat(64);
    data.managementReports[0].evidenceRefs = [];
    const audit = (delivery.auditDeliveryReportingAudit as Function)(workspace(), upstreamData(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('audit_history_chain_broken');
    expect(codes).toContain('management_report_direct_evidence_missing');
  });
});
