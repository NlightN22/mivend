export interface LinePricingInput {
    quantity: number;
    unitPrice: number | null;
    compareAtPrice?: number | null;
    linePriceWithTax: number;
}

export interface LinePricing {
    unit: number;
    total: number;
    oldUnit: number | null;
    oldTotal: number | null;
}

// compareAtPrice/unitPrice share a tax basis, so their ratio carries the with-tax unit price over.
export function deriveLinePricing(line: LinePricingInput): LinePricing {
    const unit = line.quantity > 0 ? line.linePriceWithTax / line.quantity / 100 : 0;
    const total = line.linePriceWithTax / 100;
    const { unitPrice, compareAtPrice } = line;
    if (
        compareAtPrice == null ||
        unitPrice == null ||
        unitPrice <= 0 ||
        compareAtPrice <= unitPrice
    )
        return { unit, total, oldUnit: null, oldTotal: null };
    const ratio = compareAtPrice / unitPrice;
    return { unit, total, oldUnit: unit * ratio, oldTotal: total * ratio };
}
