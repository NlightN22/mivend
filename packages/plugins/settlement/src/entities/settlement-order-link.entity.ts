import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { bigintNumber } from './bigint-number.transformer';
import type { SettlementDocumentEntry } from './settlement-document-entry.entity';

// The document's own reference to an ERP order; orderId is the local Order once it is imported.
@Entity('settlement_order_link')
@Index('IDX_settlement_order_link_entry', ['entryId'])
@Index('IDX_settlement_order_link_order', ['orderId'])
@Index('IDX_settlement_order_link_pending', ['orderErpId'], { where: `"orderId" IS NULL` })
export class SettlementOrderLink {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @Column({ type: 'int' })
    entryId!: number;

    @ManyToOne('SettlementDocumentEntry', 'orderLinks', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'entryId' })
    entry?: SettlementDocumentEntry;

    @Column({ type: 'varchar' })
    orderErpId!: string;

    @Column({ type: 'varchar', nullable: true })
    orderUuid!: string | null;

    @Column({ type: 'int', nullable: true })
    orderId!: number | null;

    @Column({ type: 'bigint', transformer: bigintNumber })
    amountMinor!: number;
}
