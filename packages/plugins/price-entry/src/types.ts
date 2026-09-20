import '@vendure/core';

declare module '@vendure/core' {
    interface CustomProductFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config / plugin-erp-import's
        // own Product handling — 1C's product GUID. Declared here (not imported from another
        // plugin) since price-entry only needs to read it, same "declaration merging without a
        // package dependency" precedent as plugin-access-control's sourceAdministratorId — see
        // promo-product-lookup.ts's getProductErpId.
        externalId?: string | null;
    }
    interface CustomProductVariantFields {
        weight?: number | null;
    }
    interface CustomOrderLineFields {
        manualUnitPrice?: number | null;
        manualPriceReason?: string | null;
    }
}

// The floor-price threshold is stored as an ordinary ProductVariantPriceEntry, keyed by this
// well-known priceTypeCode — same mechanism as RETAIL/WHOLESALE, no separate entity needed.
// The code itself is a fixed technical identifier (like OFFLINE_TERMS_METHOD in
// plugin-documents), not swappable business data — only the per-variant *value* is DB-driven.
export const FLOOR_PRICE_TYPE_CODE = 'FLOOR';

export type PriceAdjustmentDecision = 'apply-directly' | 'requires-approval';

export const loggerCtx = 'PriceEntryPlugin';
