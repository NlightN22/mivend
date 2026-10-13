import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import type { SettlementDocumentEntry } from './settlement-document-entry.entity';

// ERP-owned registrar document, keyed by its uuid (the number is not unique).
@Entity('settlement_document')
@Index('IDX_settlement_document_erp_id', ['erpId'], { unique: true })
@Index('IDX_settlement_document_date', ['date'])
export class SettlementDocument {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;

    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    documentType!: string;

    @Column({ type: 'varchar' })
    documentTypeLabel!: string;

    @Column({ type: 'varchar' })
    number!: string;

    @Column({ type: 'timestamptz' })
    date!: Date;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;

    @Column({ type: 'varchar' })
    sourceVersion!: string;

    // Only rows marked ERP-owned are ever removed by the retention cleaner.
    @Column({ type: 'boolean', default: true })
    isErpOwned!: boolean;

    @OneToMany('SettlementDocumentEntry', 'document')
    entries?: SettlementDocumentEntry[];
}
