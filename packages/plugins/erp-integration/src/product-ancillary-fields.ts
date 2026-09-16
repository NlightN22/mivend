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

// `barcodes` (repeated string) — proto3 omits an empty repeated field entirely; an absent key
// means "no barcodes," never an explicit empty array write.
export function extractBarcodes(payload: Record<string, unknown>): string[] {
    if (!Array.isArray(payload.barcodes)) {
        return [];
    }
    return payload.barcodes.filter(
        (code): code is string => typeof code === 'string' && code !== '',
    );
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
