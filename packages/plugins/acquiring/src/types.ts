// Must match every other declaration (apps/server, erp-import) exactly, or apps/server's tsc fails
// with TS2687/TS2717. Declared locally so this plugin builds standalone.
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled?: boolean;
    }
}

export const loggerCtx = 'AcquiringPlugin';

export const ACQUIRING_PLUGIN_OPTIONS = Symbol('ACQUIRING_PLUGIN_OPTIONS');

// The sweep is a recovery path for failed or missed events, not the primary processing path.
// customer-initiated payProformaInvoice processes immediately, so the polling stays slow.
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
