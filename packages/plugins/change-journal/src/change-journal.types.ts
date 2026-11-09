export const loggerCtx = 'ChangeJournalPlugin';

export const CHANGE_JOURNAL_PLUGIN_OPTIONS = Symbol('CHANGE_JOURNAL_PLUGIN_OPTIONS');

export const RETENTION_DAYS_DEFAULT = 365;
export const CLEANUP_INTERVAL_DEFAULT_MS = 60 * 60_000;
export const CLEANUP_BATCH_SIZE_DEFAULT = 5_000;
export const CLEANUP_MAX_BATCHES_PER_RUN = 200;

export interface ChangeJournalPluginOptions {
    retentionDays?: number;
    cleanupIntervalMs?: number;
}

export type ChangeActorType = 'administrator' | 'customer' | 'acting' | 'system';

export type ChangeAction = 'insert' | 'update' | 'soft-remove' | 'recover' | 'remove';

export interface ChangeActor {
    actorType: ChangeActorType;
    userId: string | null;
    administratorId: string | null;
}

export interface FieldChange {
    before?: unknown;
    after?: unknown;
    redacted?: true;
}

export type FieldChanges = Record<string, FieldChange>;

export interface ChangeJournalRecord extends ChangeActor {
    source: string;
    requestId: string | null;
    sessionId: string | null;
    entityType: string;
    entityId: string;
    entityUuid: string | null;
    action: ChangeAction;
    changes: FieldChanges;
    occurredAt: Date;
}
