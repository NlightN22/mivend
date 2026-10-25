// proto3 JSON omits zero-valued scalars: absence means zero/empty, not an invalid payload.
export function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function zeroNumber(value: unknown): number {
    if (value == null || value === '') return 0;
    return Number(value);
}

export function optionalNumber(value: unknown): number | null {
    return value == null || value === '' ? null : Number(value);
}

export function optionalString(value: unknown): string | null {
    return value == null || value === '' ? null : String(value);
}
