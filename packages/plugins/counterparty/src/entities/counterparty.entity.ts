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

    // Kept alongside assignedManagerId so it can be backfilled once the deferred manager link resolves.
    // Resolution may be deferred (manager's Administrator not yet linked); indexed for that lookup.
    @Index()
    @Column({ type: 'varchar', nullable: true })
    managerErpId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    departmentId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    // Manual branch pick; BranchAssignmentService (access-control) never overwrites it and writes branchId from it.
    @Column({ type: 'varchar', nullable: true })
    branchOverrideId!: string | null;

    // Display and filtering only; never used for access control or business rules.
    // ERP's 'group' meaning is inconsistent (department, manager, or function), so kept opaque.
    @Column({ type: 'varchar', nullable: true })
    erpGroupLabel!: string | null;

    // Portal-approved override; paymentDelayDays stays ERP master data and is never mutated here.
    // Not pushed back to the ERP yet (no bidirectional sync wired).
    @Column({ type: 'int', nullable: true })
    creditTermOverrideExtraDays!: number | null;

    // Required by the ERP to save a Counterparty; display/completeness only, not an activation gate.
    @Column({ type: 'varchar', nullable: true })
    legalAddress!: string | null;

    // Фактический адрес контрагента — same "ERP requires it, mivend just stores it" status as
    // legalAddress above. #120's Decision 1: display/completeness, not an activation gate.
    @Column({ type: 'varchar', nullable: true })
    factualAddress!: string | null;

    // Телефон контрагента — required (with officialEmail below) by #120's Decision 2 before the
    // portal-access activation toggle can be turned on for this counterparty.
    @Column({ type: 'varchar', nullable: true })
    phone!: string | null;

    // The counterparty's login-eligible email, not a legal/registration address.
    // Required together with phone before portal-access activation.
    @Column({ type: 'varchar', nullable: true })
    officialEmail!: string | null;

    // Deliberately no column: a separate ERP fact from phone, but no consumer reads it yet.
    // Add the column once a real consumer exists; the stream handler notes the same deferral.

    // Soft links to other ERP entities (mainContractId -> contract, mainBankAccountId -> bank
    // account, regionId -> region, legalFormId -> legal form): no FK, the target may arrive later or never.
    @Column({ type: 'varchar', nullable: true })
    mainContractId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    fullName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    mainBankAccountId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    ogrnip!: string | null;

    @Column({ type: 'varchar', nullable: true })
    kpp!: string | null;

    @Column({ type: 'varchar', nullable: true })
    okpo!: string | null;

    @Column({ type: 'varchar', nullable: true })
    legalType!: string | null;

    @Column({ type: 'varchar', nullable: true })
    regionId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    legalFormId!: string | null;
}
