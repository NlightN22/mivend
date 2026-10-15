import '@vendure/core';

declare module '@vendure/core' {
    interface CustomProductFields {
        // Declared locally via declaration merging: price-entry only reads it, so it takes no package
        // dependency on the plugin that owns this field (customFields in vendure-config.ts).
        externalId?: string | null;
    }
    interface CustomProductVariantFields {
        weight?: number | null;
    }
    interface CustomOrderLineFields {
        manualUnitPrice?: number | null;
        manualPriceReason?: string | null;
    }
    interface CustomOrderFields {
        // Declaration-merged: CounterpartyDiscountRuleService matches "contract" rules through it,
        // so there is no package dependency on @mivend/plugin-erp-order.
        erpContractId?: string | null;
    }
}

// priceTypeCode is a fixed technical identifier, not business data: only the per-variant value
// is DB-driven, so the code must not be made configurable.
export const FLOOR_PRICE_TYPE_CODE = 'FLOOR';

export type PriceAdjustmentDecision = 'apply-directly' | 'requires-approval';

export const loggerCtx = 'PriceEntryPlugin';
