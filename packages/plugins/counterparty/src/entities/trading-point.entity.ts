import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { Counterparty } from './counterparty.entity';
import { ContactPerson } from './contact-person.entity';

@Entity()
export class TradingPoint extends VendureEntity {
    constructor(input?: DeepPartial<TradingPoint>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @ManyToOne(() => Counterparty, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn()
    counterparty!: Counterparty;

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar' })
    address!: string;

    @Column({ type: 'float', nullable: true })
    latitude!: number | null;

    @Column({ type: 'float', nullable: true })
    longitude!: number | null;

    @Column({ type: 'varchar', nullable: true })
    workingHours!: string | null;

    @Column({ type: 'varchar', nullable: true })
    deliveryComment!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    // 'active' | 'hidden' — customer-controlled soft delete
    @Column({ type: 'varchar', default: 'active' })
    customerStatus!: string;

    // true = added/edited by customer (not yet in ERP)
    @Column({ type: 'boolean', default: false })
    customerOwned!: boolean;

    // Which branch/subdivision physically services this location (visits, logistics,
    // fulfillment) — the "territory" axis, separate from Counterparty.branchId's "home/reporting
    // branch" (key-account/commission axis). See docs/access-control.md "Branch scope is a
    // separate axis from own/department/all". Defaults from the parent Counterparty's branchId
    // at creation time (covers the single-branch majority case); explicitly overridable per
    // point for chain accounts whose locations span multiple branches.
    @Column({ type: 'varchar', nullable: true })
    servicingBranchId!: string | null;

    @OneToMany(() => ContactPerson, (cp: ContactPerson) => cp.tradingPoint, {
        cascade: true,
        eager: true,
    })
    contacts!: ContactPerson[];
}
