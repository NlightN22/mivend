import type { OrderLine } from '@vendure/core';
import { isUnconfirmedTaxRateName } from 'shared';

export interface LineTaxSnapshot {
    taxRate: number | null;
    taxCategoryName: string | null;
    taxAmount: number;
}

// Prices are VAT-inclusive, so VAT is extracted from the amount: round(total * rate / (100 + rate)).
export function extractVat(totalWithTax: number, ratePercent: number): number {
    return Math.round((totalWithTax * ratePercent) / (100 + ratePercent));
}

export function snapshotTax(line: OrderLine, netAmount: number): LineTaxSnapshot {
    const taxLines = line.taxLines ?? [];
    const taxCategoryName = line.taxCategory?.name ?? null;
    const unconfirmed =
        taxLines.length === 0 ||
        taxLines.some(t => t.taxRate === 0 && isUnconfirmedTaxRateName(t.description));
    if (unconfirmed) return { taxRate: null, taxCategoryName, taxAmount: 0 };
    const taxRate = taxLines.reduce((sum, t) => sum + t.taxRate, 0);
    return { taxRate, taxCategoryName, taxAmount: extractVat(netAmount, taxRate) };
}
