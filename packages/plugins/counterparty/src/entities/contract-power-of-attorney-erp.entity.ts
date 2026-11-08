import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

// Powers of attorney as the ERP sent them inside a contract event; contractId, counterpartyId and organizationId are ERP ids (no foreign keys).
@Entity('contract_power_of_attorney_erp')
@Index('IDX_contract_power_of_attorney_erp_contract', ['contractId'])
@Index('IDX_contract_power_of_attorney_erp_counterparty', ['counterpartyId'])
export class ContractPowerOfAttorneyErp {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;

    @Column({ type: 'varchar' })
    contractId!: string;

    @Column({ type: 'varchar', nullable: true })
    counterpartyId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    organizationId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    externalId!: string | null;

    @Column({ type: 'varchar', default: '' })
    number!: string;

    @Column({ type: 'varchar', default: '' })
    holderName!: string;

    @Column({ type: 'timestamptz', nullable: true })
    issueDate!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    validUntil!: Date | null;

    @Column({ type: 'varchar', nullable: true })
    scanId!: string | null;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
