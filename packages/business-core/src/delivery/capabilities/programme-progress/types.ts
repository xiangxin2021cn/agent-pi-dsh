import type { DeliveryEvidenceRef } from '../../types.ts';
import type { DeliveryScopeItem } from '../contract-scope/types.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityReadiness } from '../types.ts';

export interface DeliveryProgrammeCalendar {
  id: string;
  name: string;
  workingDays: number[];
  exceptions: string[];
}

export interface DeliveryActivityPredecessor {
  activityId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export interface DeliveryProgrammeActivity {
  id: string;
  scopeItemId: DeliveryScopeItem['id'];
  name: string;
  calendarId: string;
  baselineStart: string;
  baselineFinish: string;
  actualStart?: string;
  actualFinish?: string;
  remainingDurationDays: number;
  forecastStart: string;
  forecastFinish: string;
  percentComplete: number;
  predecessors: DeliveryActivityPredecessor[];
  progressEvidenceRefs: DeliveryEvidenceRef[];
  status: 'completed' | 'in_progress' | 'not_started' | 'blocked';
  confidence: 'confirmed' | 'scenario' | 'unverified';
}

export interface DeliveryProgrammeMilestone {
  id: string;
  title: string;
  activityId: string;
  kind: 'contractual' | 'internal';
  baselineDate: string;
  forecastDate: string;
  evidenceRefs: DeliveryEvidenceRef[];
}

export interface DeliveryRecoveryScenario {
  id: string;
  title: string;
  status: 'draft' | 'reviewed';
  assumptions: string[];
  activityAdjustments: Array<{
    activityId: string;
    forecastFinish: string;
    remainingDurationDays: number;
  }>;
}

export interface DeliveryProgrammeProgressData {
  programmeStatus: 'draft' | 'reviewed' | 'blocked';
  dataDate: string;
  calendars: DeliveryProgrammeCalendar[];
  activities: DeliveryProgrammeActivity[];
  milestones: DeliveryProgrammeMilestone[];
  recoveryScenarios: DeliveryRecoveryScenario[];
}

export interface DeliveryProgrammeProgressAudit {
  schemaVersion: 1;
  capability: 'programme_progress';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: DeliveryCapabilityReadiness;
  summary: {
    calendars: number;
    activities: number;
    completedActivities: number;
    inProgressActivities: number;
    notStartedActivities: number;
    blockedActivities: number;
    milestones: number;
    recoveryScenarios: number;
  };
  issues: DeliveryCapabilityAuditIssue[];
}
