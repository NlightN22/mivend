export const loggerCtx = 'DeferredPaymentPlugin';
export const DEFERRED_PAYMENT_METHOD_CODE = 'deferred-payment';
export const DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS = 7;

declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        deferredOrderMaxAgeDays?: number | null;
    }
}
