import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

// ERP-owned reference: keeps the ERP's own `code`, so it carries no mivend uuid.
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

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;

    @Column({ type: 'varchar' })
    sourceVersion!: string;
}
