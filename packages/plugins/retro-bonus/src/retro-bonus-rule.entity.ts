import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Open ERP string (display text), stored raw and translated only at the GraphQL layer.
export type RetroBonusAccrualKind = string;

// Read-only, upsert-only feed: deactivation and conflict handling live in RetroBonusRuleService.
// Known gap: unused 1C rules marked for deletion never rewrite the register; validTo may go stale.
@Entity()
@Index(['erpId'], { unique: true })
@Index(['counterpartyErpId', 'recipientContractErpId'])
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
