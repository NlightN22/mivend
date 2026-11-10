import type { ChangeJournalFilter } from '../api/changeJournal';

export interface ChangeJournalUrlFilters {
    [key: string]: string;
    entityType: string;
    actorType: string;
    userId: string;
    administratorId: string;
    from: string;
    to: string;
}

export const BLANK_CHANGE_JOURNAL_FILTERS: ChangeJournalUrlFilters = {
    entityType: '',
    actorType: '',
    userId: '',
    administratorId: '',
    from: '',
    to: '',
};

function localDayStart(iso: string, addDays = 0): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + addDays);
}

// Dates are whole local days: `to` includes its own day, so the bound is the next day's start.
export function toChangeJournalFilter(state: ChangeJournalUrlFilters): ChangeJournalFilter {
    const filter: ChangeJournalFilter = {};
    if (state.entityType.trim()) filter.entityType = state.entityType.trim();
    if (state.actorType) filter.actorType = state.actorType;
    if (state.userId.trim()) filter.userId = state.userId.trim();
    if (state.administratorId) filter.administratorId = state.administratorId;
    const after = localDayStart(state.from);
    if (after) filter.occurredAfter = after.toISOString();
    const before = localDayStart(state.to, 1);
    if (before) filter.occurredBefore = before.toISOString();
    return filter;
}
