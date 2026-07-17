import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type IncomingPaymentEventStatus = 'pending' | 'processing' | 'processed' | 'failed';

// The durable "inbox" half of the inbox/outbox pattern (AGENTS.md sync rule #1, docs/payments.md
// idempotency levels 2-3) for payment events reported by an external source — a real acquirer
// webhook (once Robokassa/issue #46 lands), a branch till, or an ERP-reported bank transfer.
//
// Deliberately NOT the same shape as a bare "have we seen this event" marker: `status` tracks
// the event through its own lifecycle (pending -> processing -> processed, or -> failed after
// exhausting retries), separate from whether it was merely *received*. This is what makes
// recovery possible — if the process crashes after receiving an event but before finishing
// PaymentInboxProcessorService.processPendingEvents' work on it, the row is left in
// 'processing'/'pending' (never advanced to 'processed'), so the next periodic sweep picks it
// back up automatically. A row is only ever marked 'processed' *after* the real work
// (PaymentAttemptService.payInvoice) actually completes.
@Entity()
@Index(['provider', 'providerEventId'], { unique: true })
export class IncomingPaymentEvent extends VendureEntity {
    constructor(input?: DeepPartial<IncomingPaymentEvent>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    provider!: string;

    @Column({ type: 'varchar' })
    providerEventId!: string;

    @Column({ type: 'varchar' })
    payloadHash!: string;

    // JSON-encoded IncomingPaymentPayload (see payment-inbox-processor.service.ts) — the actual
    // data needed to process the event later, not just a fact that "something happened".
    @Column({ type: 'text' })
    payload!: string;

    @Column({ type: 'varchar', default: 'pending' })
    status!: IncomingPaymentEventStatus;

    @Column({ type: 'int', default: 0 })
    attempts!: number;

    @Column({ type: 'text', nullable: true })
    lastError!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    processedAt!: Date | null;
}
