export type StockVariant = 'out' | 'low' | 'medium' | 'high';

// docs/order-flow.md "Customer-facing stock tiers": 0 / 1-4 / 5-19 / 20+.
const BY_LEVEL: Record<string, StockVariant> = {
    OUT_OF_STOCK: 'out',
    LOW_STOCK: 'low',
    MEDIUM_STOCK: 'medium',
    HIGH_STOCK: 'high',
};

export function stockVariantFromLevel(level?: string | null): StockVariant {
    return BY_LEVEL[level ?? ''] ?? 'out';
}

export function stockVariantFromQuantity(quantity: number): StockVariant {
    if (quantity <= 0) return 'out';
    if (quantity < 5) return 'low';
    if (quantity < 20) return 'medium';
    return 'high';
}

export const STOCK_VARIANT_LABELS: Record<StockVariant, string> = {
    high: 'В наличии',
    medium: 'Достаточно',
    low: 'Мало',
    out: 'Нет в наличии',
};
