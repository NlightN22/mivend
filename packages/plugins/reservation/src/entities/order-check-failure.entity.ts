import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// A check run that errored and was skipped so the order flow could continue (fail-open); read by the health counters.
@Entity()
@Index(['createdAt'])
export class OrderCheckFailure extends UuidEntity {
    constructor(input?: DeepPartial<OrderCheckFailure>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    orderId!: string;

    @Column({ type: 'varchar' })
    stage!: string;

    @Column({ type: 'text' })
    message!: string;
}
