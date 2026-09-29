import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class Contract extends VendureEntity {
    constructor(input?: DeepPartial<Contract>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    // Resolved local Counterparty.id, never a raw ERP erpId — see ContractStreamHandler, which
    // resolves counterparty_id via CounterpartyService.findByErpId before upserting.
    @Index()
    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar' })
    organizationId!: string;

    @Column({ type: 'varchar' })
    priceTypeId!: string;

    // String, not bigint like Counterparty.creditLimit — matches ContractChanged.credit_limit's
    // own float-avoidance shape (docs/ai/erp-streams-map.md).
    @Column({ type: 'varchar', nullable: true })
    creditLimit!: string | null;

    @Column({ type: 'varchar', nullable: true })
    currency!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    // #50's per-contract credit-gate signal — never inferred from creditLimit being set (see
    // docs/ai/erp-streams-map.md's "Per-contract credit limits" section).
    @Column({ type: 'boolean', nullable: true })
    controlledIndividually!: boolean | null;

    @Column({ type: 'int', nullable: true })
    debtDaysLimit!: number | null;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;

    @Column({ type: 'varchar' })
    contractKind!: string;

    @Column({ type: 'varchar', nullable: true })
    paymentKind!: string | null;

    @Column({ type: 'int', nullable: true })
    paymentDelayDays!: number | null;

    @Column({ type: 'varchar' })
    contractType!: string;

    @Column({ type: 'varchar', nullable: true })
    brandManufacturerId!: string | null;
}
