export interface LinePricingInput {
    quantity: number;
    unitPriceWithTax: number | null;
    compareAtPrice?: number | null;
    linePriceWithTax: number;
}

export interface LinePricing {
    unit: number;
    total: number;
    oldUnit: number | null;
    oldTotal: number | null;
}

// compareAtPrice is the with-tax list price, so it pairs with unitPriceWithTax, never net unitPrice.
export function deriveLinePricing(line: LinePricingInput): LinePricing {
    const unit = line.quantity > 0 ? line.linePriceWithTax / line.quantity / 100 : 0;
    const total = line.linePriceWithTax / 100;
    const { unitPriceWithTax, compareAtPrice } = line;
    if (
        compareAtPrice == null ||
        unitPriceWithTax == null ||
        unitPriceWithTax <= 0 ||
        compareAtPrice <= unitPriceWithTax
    )
        return { unit, total, oldUnit: null, oldTotal: null };
    const ratio = compareAtPrice / unitPriceWithTax;
    return { unit, total, oldUnit: unit * ratio, oldTotal: total * ratio };
}
