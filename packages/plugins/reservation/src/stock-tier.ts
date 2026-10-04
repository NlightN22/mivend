export type StockTier = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'MEDIUM_STOCK' | 'HIGH_STOCK';

export const DEFAULT_STOCK_TIER_LOW_MAX = 4;
export const DEFAULT_STOCK_TIER_MEDIUM_MAX = 19;

export interface StockTierThresholds {
    lowMax: number;
    mediumMax: number;
}

export function stockTierFor(atp: number, thresholds: StockTierThresholds): StockTier {
    if (atp <= 0) return 'OUT_OF_STOCK';
    if (atp <= thresholds.lowMax) return 'LOW_STOCK';
    if (atp <= thresholds.mediumMax) return 'MEDIUM_STOCK';
    return 'HIGH_STOCK';
}
