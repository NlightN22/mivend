export interface VatSourceLine {
    taxRate?: number | null;
    taxCategoryName?: string | null;
    taxAmount?: number;
}

export interface VatTotal {
    kind: 'amount' | 'none' | 'unavailable';
    amount: number;
}

// Legacy snapshots (no tax data) are never guessed; an unconfirmed rate fails generation so no wrong invoice is issued.
export function summarizeVat(lines: VatSourceLine[]): VatTotal {
    if (lines.some(l => l.taxRate === undefined)) return { kind: 'unavailable', amount: 0 };
    const unconfirmed = lines.find(l => l.taxRate === null);
    if (unconfirmed) {
        throw new Error(
            `VAT rate not confirmed for category ${unconfirmed.taxCategoryName ?? 'unknown'}`,
        );
    }
    if (lines.every(l => l.taxRate === 0)) return { kind: 'none', amount: 0 };
    return { kind: 'amount', amount: lines.reduce((sum, l) => sum + (l.taxAmount ?? 0), 0) };
}
