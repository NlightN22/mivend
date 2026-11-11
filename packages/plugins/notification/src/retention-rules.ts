import { CLIENT_SOURCE_TYPE } from './client-notification-rules';

// Reserved key of the row every type without its own days falls back to.
export const DEFAULT_RULE_KEY = '*';
export const MAX_RETENTION_DAYS = 3650;

export interface RetentionRuleValues {
    readDays: number | null;
    unreadDays: number | null;
}

export interface RetentionRuleRow extends RetentionRuleValues {
    sourceType: string;
}

// Provisioned once and never overwritten; every other type appears when the cleanup first sees it.
export const SEED_RULES: RetentionRuleRow[] = [
    { sourceType: DEFAULT_RULE_KEY, readDays: 90, unreadDays: 365 },
    { sourceType: CLIENT_SOURCE_TYPE, readDays: 7, unreadDays: 30 },
];

function problem(name: string, days: number | null, required: boolean): string | null {
    if (days === null) return required ? `${name} is required for the default rule` : null;
    if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS)
        return `${name} must be a whole number of days from 1 to ${MAX_RETENTION_DAYS}`;
    return null;
}

// Unread days shorter than read days is allowed: an unread row then simply expires first.
export function retentionProblems(sourceType: string, values: RetentionRuleValues): string[] {
    const required = sourceType === DEFAULT_RULE_KEY;
    return [
        problem('readDays', values.readDays, required),
        problem('unreadDays', values.unreadDays, required),
    ].filter((p): p is string => p !== null);
}

export interface ResolvedRetention {
    defaultReadDays: number;
    defaultUnreadDays: number;
    // Effective days of every typed rule; a type with no rule row uses the defaults.
    sourceTypes: string[];
    readDays: number[];
    unreadDays: number[];
}

export function resolveRetention(rows: RetentionRuleRow[]): ResolvedRetention | null {
    const base = rows.find(r => r.sourceType === DEFAULT_RULE_KEY);
    if (!base || base.readDays === null || base.unreadDays === null) return null;
    const typed = rows.filter(r => r.sourceType !== DEFAULT_RULE_KEY);
    return {
        defaultReadDays: base.readDays,
        defaultUnreadDays: base.unreadDays,
        sourceTypes: typed.map(r => r.sourceType),
        readDays: typed.map(r => r.readDays ?? base.readDays!),
        unreadDays: typed.map(r => r.unreadDays ?? base.unreadDays!),
    };
}
