export const DEFAULT_RULE_KEY = '*';
// Same bound as the backend validation (retention-rules.ts); the server is the authority.
export const MAX_RETENTION_DAYS = 3650;

export function describeType(sourceType: string): string {
    return sourceType === DEFAULT_RULE_KEY ? 'Default (all other types)' : sourceType;
}

export function describeDays(days: number | null): string {
    return days === null ? 'Default' : `${days} days`;
}

export type DaysInput = { ok: true; value: number | null } | { ok: false; problem: string };

// Empty means "inherit the default"; the default rule itself needs a number.
export function parseDaysInput(text: string, allowEmpty: boolean): DaysInput {
    const trimmed = text.trim();
    if (trimmed === '') {
        return allowEmpty
            ? { ok: true, value: null }
            : { ok: false, problem: 'The default rule needs a number of days' };
    }
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < 1 || value > MAX_RETENTION_DAYS) {
        return { ok: false, problem: `Enter a whole number from 1 to ${MAX_RETENTION_DAYS}` };
    }
    return { ok: true, value };
}
