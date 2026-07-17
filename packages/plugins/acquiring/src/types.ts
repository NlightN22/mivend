export const loggerCtx = 'AcquiringPlugin';

export const ACQUIRING_PLUGIN_OPTIONS = Symbol('ACQUIRING_PLUGIN_OPTIONS');

// "Once a minute" is deliberately not aggressive — PaymentInboxWorker's sweep is a recovery
// mechanism for events that failed or arrived while something was down, not the primary
// processing path (a customer-initiated payInvoice call processes immediately). See
// docs/payments.md's inbox/outbox section and payment-inbox-processor.service.ts.
export const PAYMENT_INBOX_POLL_INTERVAL_DEFAULT = 60_000;

export interface AcquiringPluginOptions {
    redis: {
        host: string;
        port: number;
        password?: string;
        // Logical Redis DB index — must differ between a central and a branch instance sharing
        // the same physical Redis server, same reasoning as ReservationPluginOptions.redis.db
        // (packages/plugins/reservation/src/types.ts): otherwise the fixed-name 'payment-inbox'
        // BullMQ queue collides and one instance's worker can pick up the other's job.
        db?: number;
    };
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
