import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type DisputeType = 'dispute' | 'chargeback';

export type DisputeStatus = 'opened' | 'won' | 'lost' | 'reversed';

@Entity()
export class Dispute extends VendureEntity {
    constructor(input?: DeepPartial<Dispute>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    paymentId!: number;

    @Column({ type: 'varchar' })
    type!: DisputeType;

    @Column({ type: 'varchar', default: 'opened' })
    status!: DisputeStatus;

    @Column({ type: 'int' })
    amount!: number;

    @Column({ type: 'timestamp' })
    openedAt!: Date;
}
