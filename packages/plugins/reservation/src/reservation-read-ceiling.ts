// One row per (variant, location) pair of an order or a page: a larger set means a broken caller.
export const VARIANT_LOCATION_CEILING = 5000;
// Variants per availability read: 100 variants x up to 30 locations stay under the ceiling above.
export const FREE_STOCK_VARIANT_CHUNK = 100;
