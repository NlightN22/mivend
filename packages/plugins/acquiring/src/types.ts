// Owned by apps/server/src/vendure-config.ts's customFields config — declared locally so this
// package type-checks standalone (packages/plugins/tsconfig.json builds separately from
// apps/server), same pattern as plugin-erp-integration/src/types.ts. Read by
// offline-terms-handler.ts's computeInvoiceSplit.
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled: boolean;
    }
}

export const loggerCtx = 'AcquiringPlugin';

export const ACQUIRING_PLUGIN_OPTIONS = Symbol('ACQUIRING_PLUGIN_OPTIONS');

// "Once a minute" is deliberately not aggressive — PaymentInboxWorker's sweep is a recovery
// mechanism for events that failed or arrived while something was down, not the primary
// processing path (a customer-initiated payInvoice call processes immediately). See
// docs/payments.md's inbox/outbox section and payment-inbox-processor.service.ts.
export const PAYMENT_INBOX_POLL_INTERVAL_DEFAULT = 60_000;

export interface AcquiringPluginOptions {
    paymentInboxPollIntervalMs?: number;
}

export class IdempotencyConflictError extends Error {
    constructor(
        public readonly reason: 'payload-mismatch' | 'in-progress',
        message: string,
    ) {
        super(message);
        this.name = 'IdempotencyConflictError';
    }
}
