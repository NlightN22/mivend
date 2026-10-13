import type { OrderLine } from '@vendure/core';

export interface LineTaxSnapshot {
    taxRate: number | null;
    taxCategoryName: string | null;
    taxAmount: number;
}

// The ERP-integration placeholder rate (value 0, name contains this) means "VAT code known, percent not confirmed".
const UNCONFIRMED_RATE_MARKER = '(auto,';

// Prices are VAT-inclusive, so VAT is extracted from the amount: round(total * rate / (100 + rate)).
export function extractVat(totalWithTax: number, ratePercent: number): number {
    return Math.round((totalWithTax * ratePercent) / (100 + ratePercent));
}

export function snapshotTax(line: OrderLine, netAmount: number): LineTaxSnapshot {
    const taxLines = line.taxLines ?? [];
    const taxCategoryName = line.taxCategory?.name ?? null;
    const unconfirmed =
        taxLines.length === 0 ||
        taxLines.some(t => t.taxRate === 0 && t.description.includes(UNCONFIRMED_RATE_MARKER));
    if (unconfirmed) return { taxRate: null, taxCategoryName, taxAmount: 0 };
    const taxRate = taxLines.reduce((sum, t) => sum + t.taxRate, 0);
    return { taxRate, taxCategoryName, taxAmount: extractVat(netAmount, taxRate) };
}
