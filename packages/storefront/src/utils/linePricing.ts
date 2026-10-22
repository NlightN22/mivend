export interface LinePricingInput {
    quantity: number;
    discountedUnitPriceWithTax: number | null;
    compareAtPrice?: number | null;
    discountedLinePriceWithTax: number;
}

export interface LinePricing {
    unit: number;
    total: number;
    oldUnit: number | null;
    oldTotal: number | null;
}

// compareAtPrice is the with-tax list price, so it pairs with discountedUnitPriceWithTax, never net unitPrice.
export function deriveLinePricing(line: LinePricingInput): LinePricing {
    const unit = line.quantity > 0 ? line.discountedLinePriceWithTax / line.quantity / 100 : 0;
    const total = line.discountedLinePriceWithTax / 100;
    const { discountedUnitPriceWithTax, compareAtPrice } = line;
    if (
        compareAtPrice == null ||
        discountedUnitPriceWithTax == null ||
        discountedUnitPriceWithTax <= 0 ||
        compareAtPrice <= discountedUnitPriceWithTax
    )
        return { unit, total, oldUnit: null, oldTotal: null };
    const ratio = compareAtPrice / discountedUnitPriceWithTax;
    return { unit, total, oldUnit: unit * ratio, oldTotal: total * ratio };
}
