// Shared mock-data builders for storefront page stories — kept minimal, just enough to satisfy
// the shapes real pages destructure. Not a generic factory library; extend narrowly as needed.

export function buildWidgetProduct(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id: 'prod-1',
        name: 'Brake pad set',
        slug: 'brake-pad-set',
        variants: [
            {
                id: 'var-1',
                sku: 'sku-10021',
                price: 250000,
                customerPrice: 230000,
                compareAtPrice: 280000,
                discountTiers: [{ percent: 5, minWeightKg: null, minAmount: 10 }],
                currencyCode: 'RUB',
                stockLevel: 'IN_STOCK',
            },
        ],
        facetValues: [
            { id: 'fv-1', name: 'Brakes', facet: { code: 'category', name: 'Category' } },
        ],
        ...overrides,
    };
}

export function buildSearchItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        productId: 'prod-1',
        productVariantId: 'var-1',
        productName: 'Brake pad set',
        slug: 'brake-pad-set',
        sku: 'sku-10021',
        priceWithTax: { value: 250000 },
        currencyCode: 'RUB',
        inStock: true,
        facetValueIds: ['fv-1'],
        customerPrice: 230000,
        compareAtPrice: 280000,
        discountTiers: [{ percent: 5, minWeightKg: null, minAmount: 10 }],
        ...overrides,
    };
}

export function buildOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: '1',
        code: 'ORD-101',
        state: 'PaymentAuthorized',
        orderPlacedAt: new Date().toISOString(),
        totalWithTax: 450000,
        currencyCode: 'RUB',
        lines: [],
        ...overrides,
    };
}
