import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// What the ERP reports as reserved for a mivend order, per variant (order-changed /
// order-registration-result). A display and audit fact: availability never subtracts it.
@Index('idx_erp_order_reserve_order_variant', ['orderId', 'productVariantId'], { unique: true })
@Entity()
export class ErpOrderReserve extends UuidEntity {
    constructor(input?: DeepPartial<ErpOrderReserve>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    orderId!: string;

    @Index()
    @Column({ type: 'varchar' })
    productVariantId!: string;

    @Column({ type: 'int' })
    quantity!: number;

    @Column({ type: 'timestamp', nullable: true })
    reserveUntil!: Date | null;
}
