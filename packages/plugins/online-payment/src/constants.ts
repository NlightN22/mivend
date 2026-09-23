// Owned by apps/server/src/vendure-config.ts's customFields config — declared locally so this
// package type-checks standalone (packages/plugins/tsconfig.json builds separately from
// apps/server), same pattern as plugin-erp-integration/src/types.ts. Read by
// online-stub-handler.ts's computeInvoiceSplit.
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled: boolean;
    }
}

export const loggerCtx = 'OnlinePaymentPlugin';
