import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Demand that stock could not cover, recorded when staff cut an order to what is available (#233).
@Entity()
export class OrderLineShortfall extends UuidEntity {
    constructor(input?: DeepPartial<OrderLineShortfall>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    orderId!: string;

    @Column({ type: 'varchar' })
    orderLineId!: string;

    @Index()
    @Column({ type: 'varchar' })
    productVariantId!: string;

    // The line's own organization at the time (numeric id as stamped on the line); null when unknown.
    @Column({ type: 'varchar', nullable: true })
    organizationId!: string | null;

    @Column({ type: 'int' })
    requestedQuantity!: number;

    @Column({ type: 'int' })
    keptQuantity!: number;

    @Column({ type: 'int' })
    shortfallQuantity!: number;

    // Which source limited the line when it was cut: warehouse | organization.
    @Column({ type: 'varchar', nullable: true })
    limitedBy!: string | null;

    @Column({ type: 'varchar', nullable: true })
    administratorId!: string | null;
}
