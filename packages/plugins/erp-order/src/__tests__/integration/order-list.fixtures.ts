import {
    Column,
    Entity,
    EntitySchema,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Counterparty } from '@mivend/plugin-counterparty';

@Entity('customer')
export class TestCustomer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) phoneNumber!: string | null;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
}

@Entity('order_line')
export class TestLine {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
}

@Entity('fulfillment')
export class TestFulfillment {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
}

@Entity('order')
export class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar', default: 'PaymentSettled' }) state!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', nullable: true }) orderPlacedAt!: Date | null;
    @Column({ type: 'int', default: 0 }) subTotalWithTax!: number;
    @Column({ type: 'int', default: 0 }) shippingWithTax!: number;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
    @Column({ name: 'customFieldsPlacedbyadministratorid', type: 'varchar', nullable: true })
    placedBy!: string | null;
    @Column({ name: 'customFieldsReservationstate', type: 'varchar', nullable: true })
    reservationState!: string | null;
    @Column({ name: 'customFieldsReservationfailurereason', type: 'varchar', nullable: true })
    failureReason!: string | null;
    @Column({ name: 'customFieldsErpstatus', type: 'varchar', nullable: true })
    erpStatus!: string | null;
    @Column({ name: 'customFieldsHascheckfindings', type: 'boolean', default: false })
    hasCheckFindings!: boolean;
    @Column({ type: 'int', nullable: true }) customerId!: number | null;
    @ManyToOne(() => TestCustomer, { createForeignKeyConstraints: false })
    @JoinColumn({ name: 'customerId' })
    customer!: TestCustomer | null;
    @OneToMany(() => TestLine, l => l.orderId) lines!: TestLine[];
    @OneToMany(() => TestFulfillment, f => f.orderId) fulfillments!: TestFulfillment[];
}

export const counterpartySchema = new EntitySchema({
    name: 'counterparty',
    target: Counterparty,
    columns: {
        id: { type: Number, primary: true, generated: true },
        erpId: { type: String },
        legalName: { type: String, default: '' },
        shortName: { type: String, default: '' },
        inn: { type: String, nullable: true },
        assignedManagerId: { type: String, nullable: true },
        branchId: { type: String, nullable: true },
    },
});
