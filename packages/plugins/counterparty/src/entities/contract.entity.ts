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

    // Kept as a string (like ContractChanged.credit_limit itself), not bigint — avoids the
    // whole-currency-unit rounding convention Counterparty.creditLimit relies on, since this
    // value is display/reference only until #50's controlledIndividually gate is wired up.
    @Column({ type: 'varchar', nullable: true })
    creditLimit!: string | null;

    @Column({ type: 'varchar', nullable: true })
    currency!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    // #50's per-contract credit-gate signal (1C's own КонтролироватьПоДоговору) — when true, this
    // contract's own creditLimit is enforced individually, on top of the counterparty's aggregate
    // cap; when false, creditLimit here is reference/display-only. Never inferred from creditLimit
    // being set (see #50/#105 issue history's explicit retraction of that inference).
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
