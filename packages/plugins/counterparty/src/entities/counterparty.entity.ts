import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class Counterparty extends VendureEntity {
    constructor(input?: DeepPartial<Counterparty>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    legalName!: string;

    @Column({ type: 'varchar' })
    shortName!: string;

    @Column({ type: 'varchar', nullable: true })
    inn!: string | null;

    @Column({ type: 'bigint', default: 0 })
    creditLimit!: number;

    @Column({ type: 'bigint', default: 0 })
    creditBalance!: number;

    @Column({ type: 'int', default: 0 })
    paymentDelayDays!: number;

    @Column({ type: 'varchar', default: 'retail' })
    priceType!: string;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ type: 'varchar', nullable: true })
    assignedManagerId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    departmentId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    // Portal-approved extension on top of the ERP-sourced paymentDelayDays — never written
    // by erp-import, never mutates paymentDelayDays itself (that field stays ERP master
    // data, per AGENTS.md sync rules). Set only by CreditTermService once a
    // creditTermApproval(Escalated) request is approved. Real bidirectional ERP sync
    // (pushing this back to 1C) is not wired yet — see CreditTermApprovedEvent.
    @Column({ type: 'int', nullable: true })
    creditTermOverrideExtraDays!: number | null;
}
