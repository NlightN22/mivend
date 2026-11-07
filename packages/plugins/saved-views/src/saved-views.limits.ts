import { UserInputError } from '@vendure/core';

export const MAX_NAME_LENGTH = 80;
export const MAX_PAGE_KEY_LENGTH = 64;
export const MAX_FILTERS_BYTES = 16 * 1024;
export const MAX_COLUMNS = 100;
export const MAX_COLUMN_LENGTH = 64;
export const MAX_PERSONAL_VIEWS = 50;
export const MAX_SHARED_VIEWS = 50;

const PAGE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

export function validatePageKey(pageKey: string): void {
    if (
        pageKey.length === 0 ||
        pageKey.length > MAX_PAGE_KEY_LENGTH ||
        !PAGE_KEY_PATTERN.test(pageKey)
    ) {
        throw new UserInputError(
            `pageKey must be 1-${MAX_PAGE_KEY_LENGTH} letters, digits, dash, underscore or dot`,
        );
    }
}

export function normalizeName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
        throw new UserInputError(`View name must be 1-${MAX_NAME_LENGTH} characters`);
    }
    return trimmed;
}

export function validateFilters(filters: string): void {
    if (Buffer.byteLength(filters, 'utf8') > MAX_FILTERS_BYTES) {
        throw new UserInputError(`View filters exceed ${MAX_FILTERS_BYTES} bytes`);
    }
    try {
        JSON.parse(filters);
    } catch {
        throw new UserInputError('View filters must be valid JSON');
    }
}

export function validateColumns(columns: string[]): void {
    if (columns.length > MAX_COLUMNS || columns.some(c => c.length > MAX_COLUMN_LENGTH)) {
        throw new UserInputError(
            `View columns: at most ${MAX_COLUMNS} entries of ${MAX_COLUMN_LENGTH} characters`,
        );
    }
}
