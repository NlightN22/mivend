import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

// ERP-owned reference: how a settlement documentType is grouped and whether a customer sees it.
@Entity('settlement_document_type')
@Index('IDX_settlement_document_type_key', ['documentType'], { unique: true })
export class SettlementDocumentType {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;

    @Column({ type: 'varchar' })
    documentType!: string;

    @Column({ type: 'varchar' })
    label!: string;

    @Column({ type: 'varchar' })
    category!: string;

    @Column({ type: 'boolean', default: false })
    // Unused by the statement: visibility is decided by customerVisibleSql.
    customerVisible!: boolean;

    // Owned by us, never overwritten by the ERP stream: the type's amounts count toward customer turnover.
    @Column({ type: 'boolean', default: false })
    movesTurnover!: boolean;

    @Column({ type: 'int', nullable: true })
    sortOrder!: number | null;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;

    @Column({ type: 'varchar' })
    sourceVersion!: string;
}
