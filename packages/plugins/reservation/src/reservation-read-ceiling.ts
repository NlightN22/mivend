// One row per (variant, location) pair of an order or a page: a larger set means a broken caller.
export const VARIANT_LOCATION_CEILING = 5000;
// Variants per availability read: floor(ceiling / locations), so more warehouses never overflow the ceiling.
export function freeStockChunkSize(locationCount: number): number {
    return Math.max(1, Math.floor(VARIANT_LOCATION_CEILING / Math.max(1, locationCount)));
}
