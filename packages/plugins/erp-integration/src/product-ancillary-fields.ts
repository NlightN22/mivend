import { parseTimestamp } from './handlers/proto-json-fields';

// Pure extraction of ProductChanged's remaining Tier 2 fields (issue #116) that don't need the
// characteristic-map treatment: the manufacturer GUID, barcodes, and manufacturer_codes.

export interface ManufacturerCodeRow {
    lineNumber: number;
    code: string;
    manufacturer: string;
}

// `manufacturer` (optional string) — proto3 omits it entirely when genuinely unset, same
// discipline as every other optional field this plugin reads.
export function extractManufacturerId(payload: Record<string, unknown>): string | undefined {
    return typeof payload.manufacturer === 'string' && payload.manufacturer !== ''
        ? payload.manufacturer
        : undefined;
}

// Optional string fields (`manufacturerPartNumber`, `fullName`) — absent or empty means "not sent",
// never an instruction to clear the stored value.
export function extractOptionalString(
    payload: Record<string, unknown>,
    key: 'manufacturerPartNumber' | 'fullName',
): string | undefined {
    const value = payload[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
}

// `barcodes` (repeated string) — proto3 omits an empty repeated field entirely; an absent key
// means "no barcodes," never an explicit empty array write.
export function extractBarcodes(payload: Record<string, unknown>): string[] {
    if (!Array.isArray(payload.barcodes)) {
        return [];
    }
    const codes = payload.barcodes.filter(
        (code): code is string => typeof code === 'string' && code !== '',
    );
    return [...new Set(codes)];
}

// `manufacturer_codes` (repeated ManufacturerCode) — same empty-repeated-field omission.
export function extractManufacturerCodes(payload: Record<string, unknown>): ManufacturerCodeRow[] {
    if (!Array.isArray(payload.manufacturerCodes)) {
        return [];
    }
    return payload.manufacturerCodes
        .filter(
            (entry): entry is Record<string, unknown> =>
                typeof entry === 'object' && entry !== null,
        )
        .map(entry => ({
            lineNumber: typeof entry.lineNumber === 'number' ? entry.lineNumber : 0,
            code: typeof entry.code === 'string' ? entry.code : '',
            manufacturer: typeof entry.manufacturer === 'string' ? entry.manufacturer : '',
        }))
        .filter(row => row.code !== '');
}

// Catalog attribute `ДатаСоздания` from ProductChanged.source_fields: only a date value counts,
// any other kind or an absent key means "no ERP creation date".
export function extractErpCreatedAt(payload: Record<string, unknown>): Date | null {
    const fields = payload.sourceFields;
    if (typeof fields !== 'object' || fields === null) return null;
    const field = (fields as Record<string, unknown>)['ДатаСоздания'];
    if (typeof field !== 'object' || field === null) return null;
    return parseTimestamp((field as Record<string, unknown>).dateValue);
}
