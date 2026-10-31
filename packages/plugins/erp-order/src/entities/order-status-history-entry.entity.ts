import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['orderId', 'id'])
@Index(['orderId', 'occurredAt', 'id'])
export class OrderStatusHistoryEntry extends UuidEntity {
    constructor(input?: DeepPartial<OrderStatusHistoryEntry>) {
        super(input);
    }

    @Column({ type: 'int' })
    orderId!: number;

    @Column({ type: 'varchar', nullable: true })
    previousStatus!: string | null;

    @Column({ type: 'varchar' })
    status!: string;

    @Column({ type: 'timestamp', default: () => 'now()' })
    occurredAt!: Date;
}
