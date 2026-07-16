import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type PaymentRefundStatus = 'pending' | 'succeeded' | 'failed';

// Named PaymentRefund, not Refund — @vendure/core already registers its own Refund entity
// (tied 1:1 to a Vendure Payment), and TypeORM/Vendure's entity registry throws
// error.entity-name-conflict on bootstrap if two entities share a class name, regardless of
// which module they come from.
@Entity()
export class PaymentRefund extends VendureEntity {
    constructor(input?: DeepPartial<PaymentRefund>) {
        super(input);
    }

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
