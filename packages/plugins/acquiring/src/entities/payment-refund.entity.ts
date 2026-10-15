import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type PaymentRefundStatus = 'pending' | 'succeeded' | 'failed';

// @vendure/core already registers a Refund entity; duplicate entity class names fail bootstrap
// TypeORM throws error.entity-name-conflict regardless of which module declares it.
@Entity()
export class PaymentRefund extends UuidEntity {
    constructor(input?: DeepPartial<PaymentRefund>) {
        super(input);
    }

    // Flat per-instance sequence (NumberingService), same reasoning as PaymentAttempt.number —
    // our own identity, distinct from providerRefundId (the acquirer's external reference).
    @Index()
    @Column({ type: 'varchar' })
    number!: string;

    @Index()
    @Column({ type: 'int' })
    paymentId!: number;

    @Column({ type: 'int' })
    amount!: number;

    @Column({ type: 'varchar', default: 'pending' })
    status!: PaymentRefundStatus;

    @Column({ type: 'varchar', nullable: true })
    providerRefundId!: string | null;

    @Column({ type: 'varchar' })
    reason!: string;
}
