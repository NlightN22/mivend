import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import { bigintNumber } from './bigint-number.transformer';

// Reconciliation fact per triple; closingBalance is authoritative and never derived from documents.
@Entity('settlement_balance')
@Index('IDX_settlement_balance_key', ['balanceKey'], { unique: true })
@Index('IDX_settlement_balance_scope', ['counterpartyId', 'contractId'])
@Index('IDX_settlement_balance_pending_counterparty', ['counterpartyErpId'], {
    where: `"counterpartyId" IS NULL`,
})
@Index('IDX_settlement_balance_pending_contract', ['contractErpId'], {
    where: `"contractId" IS NULL`,
})
export class SettlementBalance {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;

    @Column({ type: 'varchar' })
    balanceKey!: string;

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

    @Column({ type: 'timestamptz', nullable: true })
    openingDate!: Date | null;

    @Column({ type: 'bigint', transformer: bigintNumber })
    openingBalance!: number;

    @Column({ type: 'bigint', transformer: bigintNumber })
    closingBalance!: number;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;

    @Column({ type: 'varchar' })
    sourceVersion!: string;
}
