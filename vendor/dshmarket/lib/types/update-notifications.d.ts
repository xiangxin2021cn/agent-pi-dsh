/** Shared, read-only update checks for every market surface in one profile. */
import type { UpdateStatus } from './updates.ts';
import { type UpdateCheckIntervalHours } from './update-notification-settings.ts';
export declare const UPDATE_CHECK_START_DELAY_MS = 30000;
export declare const UPDATE_CHECK_INTERVAL_MS: number;
/** Notification data; reading a snapshot never contacts an update source. */
export interface UpdateNotificationSnapshot {
    enabled: boolean;
    intervalHours: UpdateCheckIntervalHours;
    checking: boolean;
    checkedAt: number | null;
    lastSuccessAt: number | null;
    nextCheckAt: number | null;
    stale: boolean;
    error: string | null;
    updates: Record<string, UpdateStatus>;
    boot: string;
    /** Stable opaque profile identity for client-side read receipts. */
    profileKey?: string;
    updateExempt: string[];
    disabled: string[];
    blocked: string[];
}
export interface UpdateNotificationInventory {
    /** Includes the profile and release channel; a change invalidates all results. */
    context: string;
    /** Per-package source, installed version and locked commit identity. */
    packages: Record<string, string>;
}
interface MonitorDependencies {
    boot: string;
    profileKey?: string;
    enabled: boolean;
    intervalHours?: UpdateCheckIntervalHours;
    inventory(): UpdateNotificationInventory;
    preferences(): Pick<UpdateNotificationSnapshot, 'updateExempt' | 'disabled' | 'blocked'>;
    check(force: boolean): Promise<{
        updates: Record<string, UpdateStatus>;
        error?: string;
    }>;
}
export interface UpdateNotificationMonitor {
    snapshot(): UpdateNotificationSnapshot;
    check(force?: boolean): Promise<Record<string, UpdateStatus>>;
    setEnabled(enabled: boolean): void;
    setIntervalHours(intervalHours: UpdateCheckIntervalHours): void;
    dispose(): void;
}
/** Start one profile-scoped timer; callers own persistence of the preferences. */
export declare function createUpdateNotificationMonitor(deps: MonitorDependencies): UpdateNotificationMonitor;
export {};
