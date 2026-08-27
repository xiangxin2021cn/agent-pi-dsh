import type { DeliveryEvidenceRef } from '../../types.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityReadiness } from '../types.ts';

export type DeliveryResourceCategory = 'labour' | 'plant' | 'material' | 'subcontract';

export interface DeliveryResourceRecord {
  id: string;
  category: DeliveryResourceCategory;
  name: string;
  unit: string;
  availableQuantity: number;
  capacityPerDay?: number;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'confirmed' | 'blocked';
}

export interface DeliveryResourceAllocation {
  id: string;
  resourceId: string;
  activityId: string;
  plannedStart: string;
  plannedFinish: string;
  requiredQuantity: number;
  demandPerDay?: number;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface DeliveryProcurementPackage {
  id: string;
  title: string;
  category: 'material' | 'subcontract' | 'plant';
  resourceIds: string[];
  activityIds: string[];
  requiredOnSiteDate: string;
  forecastDeliveryDate: string;
  actualDeliveryDate?: string;
  leadTimeDays: number;
  supplier?: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'planned' | 'ordered' | 'delivered' | 'blocked';
  confidence: 'confirmed' | 'scenario' | 'unverified';
}

export interface DeliveryResourceConstraint {
  id: string;
  type: 'capacity' | 'delivery' | 'approval' | 'supplier' | 'storage' | 'interface';
  resourceIds: string[];
  activityIds: string[];
  description: string;
  owner: string;
  dueDate: string;
  status: 'open' | 'mitigated' | 'closed' | 'blocked';
}

export interface DeliveryResourceProcurementData {
  controlStatus: 'draft' | 'reviewed' | 'blocked';
  dataDate: string;
  resources: DeliveryResourceRecord[];
  allocations: DeliveryResourceAllocation[];
  procurementPackages: DeliveryProcurementPackage[];
  constraints: DeliveryResourceConstraint[];
}

export interface DeliveryResourceProcurementAudit {
  schemaVersion: 1;
  capability: 'resource_procurement';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: DeliveryCapabilityReadiness;
  summary: {
    resources: number;
    allocations: number;
    coveredActivities: number;
    procurementPackages: number;
    lateProcurementPackages: number;
    openConstraints: number;
  };
  issues: DeliveryCapabilityAuditIssue[];
}
