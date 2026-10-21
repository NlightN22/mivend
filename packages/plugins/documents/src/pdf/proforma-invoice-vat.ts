import { extractVat, lineNetAmount } from '@mivend/plugin-acquiring';

export interface VatSourceLine {
    taxRate?: number | null;
    taxCategoryName?: string | null;
    taxAmount?: number;
}

export interface VatTotal {
    kind: 'amount' | 'none' | 'zero' | 'unavailable';
    amount: number;
    // Set when every line carries the same non-zero rate, so the total can name it.
    rate: number | null;
}

const ZERO_RATE_CATEGORY = 'ндс0';

export function unconfirmedVatError(categoryName: string | null | undefined): string {
    return `VAT rate not confirmed for category ${categoryName ?? 'unknown'}`;
}

// A snapshot keeps taxRate null for an unconfirmed rate and is never rewritten; VAT is derived at print time
// from the category's now-confirmed rate.
export function applyPrintTimeVat<T extends VatSourceLine & Parameters<typeof lineNetAmount>[0]>(
    lines: T[],
    confirmedRates: Map<string, number>,
): T[] {
    return lines.map(line => {
        const rate =
            line.taxRate === null ? confirmedRates.get(line.taxCategoryName ?? '') : undefined;
        if (rate === undefined) return line;
        return { ...line, taxRate: rate, taxAmount: extractVat(lineNetAmount(line), rate) };
    });
}

function isZeroRateCategory(name: string | null | undefined): boolean {
    return (name ?? '').replace(/\s/g, '').toLowerCase() === ZERO_RATE_CATEGORY;
}

// Legacy snapshots (no tax data) are never guessed; an unconfirmed rate fails generation so no wrong invoice is issued.
// One tax line per order line is the norm; several would be summed (snapshotTax).
export function summarizeVat(lines: VatSourceLine[]): VatTotal {
    if (lines.some(l => l.taxRate === undefined))
        return { kind: 'unavailable', amount: 0, rate: null };
    const unconfirmed = lines.find(l => l.taxRate === null);
    if (unconfirmed) throw new Error(unconfirmedVatError(unconfirmed.taxCategoryName));
    if (lines.every(l => l.taxRate === 0)) {
        const zeroRated = lines.some(l => isZeroRateCategory(l.taxCategoryName));
        return { kind: zeroRated ? 'zero' : 'none', amount: 0, rate: null };
    }
    const rates = new Set(lines.map(l => l.taxRate));
    return {
        kind: 'amount',
        amount: lines.reduce((sum, l) => sum + (l.taxAmount ?? 0), 0),
        rate: rates.size === 1 ? (lines[0].taxRate ?? null) : null,
    };
}
