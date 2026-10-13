export const optionalString = (value: unknown): string | null =>
    value != null && value !== '' ? String(value) : null;

export function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || value === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
