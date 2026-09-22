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

    // Raw ERP manager erpId this Counterparty's assignedManagerId was (or would be) resolved
    // from — same "keep the raw ERP id alongside the resolved one" convention as
    // DiscountRule.triggerProductErpId. Needed because `assignedManagerId` resolution can be
    // deferred (the manager's own Administrator may not be linked yet — see
    // UserEnrichmentService.findManagerLink): without this, once a `counterparty` event has been
    // applied there's no way to later find "which erpId was this counterparty waiting on" to
    // backfill assignedManagerId once that erpId finally links (see
    // AdministratorLinkedListener). Indexed for that backfill lookup.
    @Index()
    @Column({ type: 'varchar', nullable: true })
    managerErpId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    departmentId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    // Free-text group/segment label from the ERP — display and filtering only, never used
    // for access control or business rules. the ERP's own "group" concept is inconsistent
    // (sometimes aligns with department, sometimes with a manager, sometimes a functional
    // label like "Accounting") — modeled as an opaque string, not a new hierarchy/entity.
    @Column({ type: 'varchar', nullable: true })
    erpGroupLabel!: string | null;

    // Portal-approved extension on top of the ERP-sourced paymentDelayDays — never written
    // by erp-import, never mutates paymentDelayDays itself (that field stays ERP master
    // data, per the internal-sync-rules skill's CQRS event-stream rule). Set only by CreditTermService once a
    // creditTermApproval(Escalated) request is approved. Real bidirectional ERP sync
    // (pushing this back to the ERP) is not wired yet — see CreditTermApprovedEvent.
    @Column({ type: 'int', nullable: true })
    creditTermOverrideExtraDays!: number | null;

    // Issue #131 (event-contracts@0.39.0's CounterpartyChanged): the counterparty's own
    // Юридический адрес — ERP requires this filled to save a Counterparty. Display/completeness
    // only per #120's Decision 1, does not gate portal-access activation.
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

    // Служебный адрес электронной почты контрагента (the ERP's own "Служебный адрес электронной
    // почты контрагента" contact-info kind) — the counterparty's real login-eligible email per
    // #120's Decision 1, not a legal/registration address. Required (with phone above) by
    // #120's Decision 2 before portal-access activation.
    @Column({ type: 'varchar', nullable: true })
    officialEmail!: string | null;

    // notificationPhone ("Телефон для оповещения контрагента") deliberately has no column here:
    // confirmed a genuinely separate ERP fact from `phone` (not the same field read two ways),
    // but #120's Decision 1/2 only need phone+officialEmail for activation, and no other mivend
    // feature reads it yet. Deferred, not dropped — CounterpartyStreamHandler documents the same
    // deferral at the point it would otherwise be read. Add a column once a real consumer exists.
}
