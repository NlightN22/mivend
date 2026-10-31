import { PRODUCT, VIS_PRICE_TYPES, VIS_WAREHOUSES } from './plan';

type ImportRecord = { type: string; data: Record<string, unknown> };

// Each product is stocked at one branch warehouse only, for the stock-scoped home widgets (#298).
export const WIDGET_PRODUCTS = {
    a: { sku: 'E2E-WGT-A', slug: 'e2e-widget-a', warehouse: VIS_WAREHOUSES.a },
    b: { sku: 'E2E-WGT-B', slug: 'e2e-widget-b', warehouse: VIS_WAREHOUSES.b },
} as const;

const STOCK = 500;
const externalId = (sku: string): string => `ext-${sku}`;

export function widgetProductRecords(organizationId: number): ImportRecord[] {
    return Object.values(WIDGET_PRODUCTS).map(p => ({
        type: 'product',
        data: {
            externalId: externalId(p.sku),
            sku: p.sku,
            name: `E2E Widget ${p.sku}`,
            slug: p.slug,
            price: PRODUCT.prices.a,
            stockOnHand: 0,
            onSale: true,
            organizationId,
        },
    }));
}

export function widgetPriceAndStockRecords(): ImportRecord[] {
    const prices = Object.values(WIDGET_PRODUCTS).flatMap(p =>
        [VIS_PRICE_TYPES.a, VIS_PRICE_TYPES.b].map(priceTypeCode => ({
            type: 'price',
            data: { productExternalId: externalId(p.sku), priceTypeCode, price: PRODUCT.prices.a },
        })),
    );
    const stock = Object.values(WIDGET_PRODUCTS).map(p => ({
        type: 'stock',
        data: { sku: p.sku, stockOnHand: STOCK, warehouseErpId: p.warehouse },
    }));
    return [...prices, ...stock];
}
