// Dev showcase for the catalog tier ladder: no flat discount, flat below the ladder, flat above it.
const rule = (brand, percent, suffix, extra, validFrom, validTo) => ({
    erpId: suffix ? `discount-${brand}-wholesale-${suffix}` : `discount-${brand}-wholesale`,
    priceTypeCode: 'WHOLESALE',
    facetCode: 'brand',
    facetValueCode: brand,
    percent,
    validFrom,
    validTo,
    ...extra,
});

export function tierShowcaseRules(validFrom, validTo) {
    const r = (brand, percent, suffix, extra = {}) =>
        rule(brand, percent, suffix, extra, validFrom, validTo);
    return [
        r('ladder-only', 10, 'volume-300', { minWeightKg: 300 }),
        r('ladder-only', 15, 'volume-600', { minWeightKg: 600 }),
        r('flat-plus-ladder', 5),
        r('flat-plus-ladder', 12, 'volume-300', { minWeightKg: 300 }),
        r('flat-beats-ladder', 20),
        r('flat-beats-ladder', 10, 'volume-300', { minWeightKg: 300 }),
        r('amount-ladder', 8, 'spend-30000', { minAmount: 30000 }),
    ];
}
