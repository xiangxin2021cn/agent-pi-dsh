import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export type TenderPredecessorType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TenderCalendar {
  id: string;
  name: string;
  workingDays: number[];
  exceptions: string[];
}

export interface TenderActivityPredecessor {
  activityId: string;
  type: TenderPredecessorType;
  lagDays: number;
}

export interface TenderActivity {
  id: string;
  workPackageId: string;
  name: string;
  durationDays: number;
  durationBasis: string;
  calendarId: string;
  predecessors: TenderActivityPredecessor[];
  requirementIds: string[];
  sourceRefs: TenderSourceLocator[];
  confidence: 'confirmed' | 'scenario' | 'unverified';
}

export interface TenderResource {
  id: string;
  class: string;
  capacity?: string;
  unit?: string;
  calendarId: string;
}

export interface TenderResourceAssignment {
  activityId: string;
  resourceId: string;
  demand: string;
}

export interface TenderMilestone {
  id: string;
  name: string;
  activityId: string;
  kind: 'contractual' | 'internal';
  requirementIds: string[];
}

export interface TenderScheduleResourceData {
  programmeStart: string;
  programmeStatus: 'draft' | 'reviewed' | 'blocked';
  calendars: TenderCalendar[];
  activities: TenderActivity[];
  resources: TenderResource[];
  assignments: TenderResourceAssignment[];
  milestones: TenderMilestone[];
}

export interface TenderScheduleActivityResult {
  activityId: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  critical: boolean;
}

export interface TenderScheduleNetworkResult {
  projectDurationDays: number;
  activities: TenderScheduleActivityResult[];
}

export interface TenderScheduleResourceAudit {
  schemaVersion: 1;
  capability: 'schedule_resources';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    calendars: number;
    activities: number;
    milestones: number;
    resources: number;
    assignments: number;
    programmeStart: string;
    projectDurationDays?: number;
    criticalActivities: number;
    unverifiedActivities: number;
  };
  network?: TenderScheduleNetworkResult;
  issues: TenderCapabilityAuditIssue[];
}
