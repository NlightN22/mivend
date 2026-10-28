import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Open ERP string (display text), stored raw and translated only at the GraphQL layer.
export type RetroBonusAccrualKind = string;

// How a dimension is given: an explicit id list, or a filter the ERP evaluates (list stays empty).
export type RetroBonusSelectionMode = string;

// One ERP setup document. Read-only: applied by RetroBonusRuleService, never to order pricing.
// Member lists live in RetroBonusRuleCounterparty/RetroBonusRuleProduct, replaced as a unit.
@Entity()
@Index(['erpId'], { unique: true })
@Index(['recipientCounterpartyErpId'])
export class RetroBonusRule extends VendureEntity {
    constructor(input?: DeepPartial<RetroBonusRule>) {
        super(input);
    }

    // The setup document uuid.
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', default: '' })
    documentNumber!: string;

    @Column({ type: 'boolean', default: false })
    isInstant!: boolean;

    @Column({ type: 'varchar', nullable: true })
    accrualPeriod!: string | null;

    @Column({ type: 'int', default: 0 })
    accrualDayNumber!: number;

    @Column({ type: 'varchar', default: '' })
    accrualKind!: RetroBonusAccrualKind;

    @Column({ type: 'double precision' })
    percent!: number;

    // Display only, never matched against an order.
    @Column({ type: 'double precision', nullable: true })
    conditionAmount!: number | null;

    @Column({ type: 'double precision', nullable: true })
    conditionQuantity!: number | null;

    @Column({ type: 'varchar', nullable: true })
    priceTypeErpId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    organizationErpId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    recipientCounterpartyErpId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    recipientContractErpId!: string | null;

    @Column({ type: 'timestamp' })
    validFrom!: Date;

    @Column({ type: 'timestamp', nullable: true })
    validTo!: Date | null;

    // False after a tombstone or an unposted document; reactivated only by a strictly newer version.
    @Column({ type: 'boolean', default: true })
    active!: boolean;

    // Why an active rule never applies (a dynamic filter mivend does not evaluate); null when it can.
    @Column({ type: 'varchar', nullable: true })
    inactiveReason!: string | null;

    // The flags win over the lists: a true flag means the list is ignored, never "empty list = all".
    @Column({ type: 'boolean', default: false })
    allCounterparties!: boolean;

    @Column({ type: 'boolean', default: false })
    allProducts!: boolean;

    @Column({ type: 'varchar', default: 'list' })
    counterpartyMode!: RetroBonusSelectionMode;

    @Column({ type: 'varchar', default: 'list' })
    productMode!: RetroBonusSelectionMode;

    // The ERP's dynamic selection as sent; mivend does not evaluate it, so a filter-mode rule has no members here.
    @Column({ type: 'jsonb', nullable: true })
    counterpartyFilter!: unknown[] | null;

    @Column({ type: 'jsonb', nullable: true })
    productFilter!: unknown[] | null;

    @Column({ type: 'varchar' })
    sourceVersion!: string;

    // Equal content under a newer version is not a change: lists are not rewritten.
    @Column({ type: 'varchar', length: 64 })
    contentHash!: string;
}
