import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

// The order status dictionary. ERP-owned rows (source 'erp') arrive from the order-status stream and keep
// the ERP's own `code`; mivend-pipeline rows (source 'mivend') are provisioned at boot. No mivend uuid either way.
@Entity('order_status_reference')
@Index('IDX_order_status_reference_code', ['code'], { unique: true })
export class OrderStatusReference {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;

    @Column({ type: 'varchar' })
    code!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'int' })
    rank!: number;

    @Column({ type: 'boolean', default: false })
    terminal!: boolean;

    @Column({ type: 'boolean', default: false })
    customerVisible!: boolean;

    @Column({ type: 'varchar', default: '' })
    description!: string;

    @Column({ type: 'varchar', default: 'erp' })
    source!: 'erp' | 'mivend';

    // Customer-facing bucket of the storefront order filter; '' when the status is in none.
    @Column({ type: 'varchar', default: '' })
    customerGroup!: string;

    // At least one posted warehouse order exists: the order can no longer be cancelled freely.
    @Column({ type: 'boolean', default: false })
    warehouseStarted!: boolean;

    // Goods have left the warehouse (a sales document is posted).
    @Column({ type: 'boolean', default: false })
    shipped!: boolean;

    @Column({ type: 'boolean', default: false })
    delivered!: boolean;

    // Cancelled; never leaves this status on our side, whatever the ERP later reports.
    @Column({ type: 'boolean', default: false })
    cancelled!: boolean;

    // Populated only on source 'mivend' rows: initial, post-ERP, ERP-rejected, ERP-reserved,
    // and fallback status for external orders whose status cannot be derived.
    @Column({ type: 'boolean', default: false })
    initial!: boolean;

    @Column({ type: 'boolean', default: false })
    submitted!: boolean;

    @Column({ type: 'boolean', default: false })
    rejected!: boolean;

    @Column({ type: 'boolean', default: false })
    reservationConfirmed!: boolean;

    @Column({ type: 'boolean', default: false })
    externalDefault!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;

    @Column({ type: 'varchar' })
    sourceVersion!: string;
}
