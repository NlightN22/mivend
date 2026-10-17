import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { TestOrder } from './reserve-order.harness';
import type { HarnessExtras } from './reserve-order.harness';

@Entity('reservation_test_shipping_method')
export class TestShippingMethod {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
    @Column({ type: 'jsonb', default: { code: 'zero-rate', args: [] } }) calculator!: unknown;
}

@Entity('reservation_test_shipping_line')
export class TestShippingLine {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar' }) shippingMethodId!: string;
    @ManyToOne(() => TestOrder)
    @JoinColumn({ name: 'orderId' })
    order!: TestOrder;
}

export const deliveryExtras: HarnessExtras = {
    entities: [TestShippingMethod, TestShippingLine],
    entityMap: { ShippingMethod: TestShippingMethod, ShippingLine: TestShippingLine },
};
