import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Issue #102: closed 4-value 1C enum (ВидыНачисленийРетроБонусов, search-platform#126) — stored
// as the raw Cyrillic wire value, same convention as DiscountRuleCondition/recipientType. Never
// translated before storage; a translated display label is resolved separately at the GraphQL
// layer (see accrualKindLabel in retro-bonus-rule.resolver.ts), same as promo-rule's operationKind.
export type RetroBonusAccrualKind =
    | 'ПоЗакупкам'
    | 'ПоПоступлениюДС'
    | 'ПоПоступлениюДССБК'
    | 'ПоПродажам';

// Issue #102: read-only, manager-portal-only feed of the ERP's retro-bonus terms log
// (RetroBonusRuleChanged). Unlike DiscountRule, this is a pure upsert-only entity — no
// deactivation/conflict/supersede logic exists here, see RetroBonusRuleService's own comment.
//
// Known accepted gap (issue #102): an unused rule explicitly marked for deletion in 1C via the
// standard soft-delete flag never rewrites the register, so the stream never learns about it —
// validTo stays stale until the rule would have naturally expired anyway. Not worth speculative
// handling (AGENTS.md "no excess code").
@Entity()
@Index(['erpId'], { unique: true })
export class RetroBonusRule extends VendureEntity {
    constructor(input?: DeepPartial<RetroBonusRule>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    productErpId!: string;

    @Column({ type: 'varchar' })
    counterpartyErpId!: string;

    @Column({ type: 'varchar', nullable: true })
    recipientContractErpId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    priceTypeErpId!: string | null;

    // Zero-coercion field (proto3 `optional bool` silently zero-valued) — absence read as false,
    // never treated as "field not sent" — see RetroBonusRuleStreamHandler.
    @Column({ type: 'boolean', default: false })
    isInstant!: boolean;

    // Raw passthrough — no fixed enum confirmed for this field (unlike accrualKind).
    @Column({ type: 'varchar', nullable: true })
    accrualPeriod!: string | null;

    // Zero-coercion field, same reasoning as isInstant.
    @Column({ type: 'int', default: 0 })
    accrualDayNumber!: number;

    @Column({ type: 'varchar' })
    accrualKind!: RetroBonusAccrualKind;

    @Column({ type: 'double precision' })
    percent!: number;

    // Pure display fields — never matched/applied to anything (issue #102).
    @Column({ type: 'double precision', nullable: true })
    limitAmount!: number | null;

    @Column({ type: 'double precision', nullable: true })
    conditionAmount!: number | null;

    @Column({ type: 'double precision', nullable: true })
    conditionQuantity!: number | null;

    @Column({ type: 'timestamp' })
    validFrom!: Date;

    // Real optional presence — null means no expiry.
    @Column({ type: 'timestamp', nullable: true })
    validTo!: Date | null;

    // The ERP event's own `version` — used by RetroBonusRuleService's version guard against
    // out-of-order Kafka redelivery.
    @Column({ type: 'varchar' })
    sourceVersion!: string;
}
