export type StockTier = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'MEDIUM_STOCK' | 'HIGH_STOCK';

export const DEFAULT_STOCK_TIER_LOW_MAX = 4;
export const DEFAULT_STOCK_TIER_MEDIUM_MAX = 19;

export interface StockTierThresholds {
    lowMax: number;
    mediumMax: number;
}

// packRatio above 1 means the variant is sold in whole packs: the tiers then count packs, not base units.
export function stockTierFor(
    atp: number,
    thresholds: StockTierThresholds,
    packRatio: number | null = null,
): StockTier {
    const sellable = packRatio !== null && packRatio > 1 ? Math.floor(atp / packRatio + 1e-9) : atp;
    return tierOfSellable(sellable, thresholds);
}

function tierOfSellable(atp: number, thresholds: StockTierThresholds): StockTier {
    if (atp <= 0) return 'OUT_OF_STOCK';
    if (atp <= thresholds.lowMax) return 'LOW_STOCK';
    if (atp <= thresholds.mediumMax) return 'MEDIUM_STOCK';
    return 'HIGH_STOCK';
}
