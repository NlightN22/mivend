export type AccountingFlags = Record<string, boolean>;

// AccountingReflection fields are proto3 optional: only a present boolean counts, nothing is defaulted.
export function parseAccounting(raw: unknown): AccountingFlags | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const flags: AccountingFlags = {};
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'boolean') flags[key] = value;
    }
    return Object.keys(flags).length > 0 ? flags : null;
}

export function toJsonText(value: unknown): string | null {
    if (typeof value !== 'object' || value === null) return null;
    return Object.keys(value).length > 0 ? JSON.stringify(value) : null;
}

export function linkedDocumentsAccounting(raw: unknown): string | null {
    if (!Array.isArray(raw)) return null;
    const rows: Array<{ kind: string; id: string; accounting: AccountingFlags }> = [];
    for (const item of raw as Array<Record<string, unknown>>) {
        const accounting = parseAccounting(item?.accounting);
        if (accounting && typeof item.kind === 'string' && typeof item.id === 'string') {
            rows.push({ kind: item.kind, id: item.id, accounting });
        }
    }
    return rows.length > 0 ? JSON.stringify(rows) : null;
}

// Per line, in the line's own unit, keyed by the ERP product id; lines without the value are left out.
export function shippedInSettlementsText(rawLines: unknown): string | null {
    if (!Array.isArray(rawLines)) return null;
    const rows: Array<{ productId: string; quantity: number }> = [];
    for (const line of rawLines as Array<Record<string, unknown>>) {
        const quantity = line?.shippedQuantityInSettlements;
        if (typeof quantity === 'number' && Number.isFinite(quantity) && line.productId) {
            rows.push({ productId: String(line.productId), quantity });
        }
    }
    return rows.length > 0 ? JSON.stringify(rows) : null;
}
