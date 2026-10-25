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
        // Declaration-merged: DiscountSetupRulesService matches contract-scoped setups through it,
        // so there is no package dependency on @mivend/plugin-erp-order.
        erpContractId?: string | null;
    }
}

export type PriceAdjustmentDecision = 'apply-directly' | 'requires-approval';

export const loggerCtx = 'PriceEntryPlugin';
