import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';

import { bigintNumber } from './bigint-number.transformer';
import type { SettlementDocument } from './settlement-document.entity';
import type { SettlementOrderLink } from './settlement-order-link.entity';

// One document's effect on one (organization, counterparty, contract) triple; amount is signed,
// minor units, positive increases the customer's debt. Local ids stay null until imported.
@Entity('settlement_document_entry')
@Index('IDX_settlement_entry_document', ['documentId'])
@Index('IDX_settlement_entry_scope', ['counterpartyId', 'contractId'])
@Index('IDX_settlement_entry_pending_counterparty', ['counterpartyErpId'], {
    where: `"counterpartyId" IS NULL`,
})
@Index('IDX_settlement_entry_pending_contract', ['contractErpId'], {
    where: `"contractId" IS NULL`,
})
@Index('IDX_settlement_entry_triple', ['organizationErpId', 'counterpartyErpId', 'contractErpId'])
export class SettlementDocumentEntry {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @Column({ type: 'int' })
    documentId!: number;

    @ManyToOne('SettlementDocument', 'entries', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'documentId' })
    document?: SettlementDocument;

    @Column({ type: 'varchar' })
    organizationErpId!: string;

    @Column({ type: 'varchar' })
    counterpartyErpId!: string;

    @Column({ type: 'varchar' })
    contractErpId!: string;

    @Column({ type: 'varchar', nullable: true })
    counterpartyId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    contractId!: string | null;

    @Column({ type: 'varchar' })
    currency!: string;

    @Column({ type: 'bigint', transformer: bigintNumber })
    amountMinor!: number;

    @Column({ type: 'timestamptz', nullable: true })
    dueDate!: Date | null;

    @OneToMany('SettlementOrderLink', 'entry')
    orderLinks?: SettlementOrderLink[];
}
