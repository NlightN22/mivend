import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type IncomingPaymentEventStatus = 'pending' | 'processing' | 'processed' | 'failed';

// Status lifecycle is separate from receipt so a crash mid-processing leaves the row unprocessed,
// and the periodic sweep retries it. Mark 'processed' only after the real work completes.
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
