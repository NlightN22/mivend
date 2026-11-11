import { UserInputError } from '@vendure/core';

export const SEARCH_MIN_TERM = 2;
export const SEARCH_MAX_TERM = 64;
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 10;

// null means "too short to ask the database" (an empty answer, not an error).
export function normalizeSearchTerm(term: string): string | null {
    const text = term.trim();
    if (text.length > SEARCH_MAX_TERM) throw new UserInputError('Invalid search term');
    return text.length < SEARCH_MIN_TERM ? null : text;
}

export function clampSearchLimit(limit: number | undefined | null): number {
    const n = Math.trunc(limit ?? SEARCH_DEFAULT_LIMIT);
    return Math.min(Math.max(n, 1), SEARCH_MAX_LIMIT);
}
