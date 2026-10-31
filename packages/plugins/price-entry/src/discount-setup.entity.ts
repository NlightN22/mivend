import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// One ERP "discount setup" document. Recipients and products live in the membership entities below,
// replaced as a unit under the document's advisory lock (issue #289/#290).
@Entity()
@Index(['erpId'], { unique: true })
export class DiscountSetup extends VendureEntity {
    constructor(input?: DeepPartial<DiscountSetup>) {
        super(input);
    }

    // The setup document uuid.
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', default: '' })
    documentNumber!: string;

    // Positive is a discount, negative a markup; competes by max with every other source.
    @Column({ type: 'double precision' })
    percent!: number;

    // The ERP condition enum value name; its meaning is DiscountConditionKind.metric. Empty = unconditional.
    @Column({ type: 'varchar', default: '' })
    conditionName!: string;

    @Column({ type: 'double precision', nullable: true })
    conditionNumber!: number | null;

    // A rule bound to a price type applies only to a customer on that price type; null = any.
    @Column({ type: 'varchar', nullable: true })
    priceTypeErpId!: string | null;

    // Captured, not enforced: it caps manual adjustments in the ERP, not the automatic percent.
    @Column({ type: 'double precision', nullable: true })
    limitPercent!: number | null;

    @Column({ type: 'timestamp' })
    validFrom!: Date;

    // Null = open-ended.
    @Column({ type: 'timestamp', nullable: true })
    validTo!: Date | null;

    // True only for a posted document mivend can evaluate; see `inactiveReason` for the rest.
    @Column({ type: 'boolean', default: true })
    active!: boolean;

    @Column({ type: 'varchar', nullable: true })
    inactiveReason!: string | null;

    @Column({ type: 'boolean', default: false })
    allProducts!: boolean;

    // 'filter': the ERP's dynamic selection, evaluated at read time from DiscountSetupFilterTerm rows.
    @Column({ type: 'varchar', default: 'list' })
    productMode!: string;

    @Column({ type: 'jsonb', nullable: true })
    productFilter!: unknown[] | null;

    @Column({ type: 'varchar' })
    sourceVersion!: string;

    // Equal content under a newer version is not a change: member lists are not rewritten.
    @Column({ type: 'varchar', length: 64 })
    contentHash!: string;
}

// An empty counterparty or contract means "any"; a row with both empty is every counterparty.
@Entity()
@Index(['counterpartyErpId', 'contractErpId', 'setupId'])
export class DiscountSetupRecipient {
    @PrimaryColumn({ type: 'int' })
    setupId!: number;

    @PrimaryColumn({ type: 'varchar', default: '' })
    counterpartyErpId!: string;

    @PrimaryColumn({ type: 'varchar', default: '' })
    contractErpId!: string;
}

@Entity()
@Index(['productErpId', 'setupId'])
export class DiscountSetupProduct {
    @PrimaryColumn({ type: 'int' })
    setupId!: number;

    @PrimaryColumn({ type: 'varchar' })
    productErpId!: string;

    // The document line's own percent; null = the header percent applies.
    @Column({ type: 'double precision', nullable: true })
    percent!: number | null;
}

// What an ERP condition name measures, so no business enum lives in code. Unknown names never match.
@Entity()
export class DiscountConditionKind {
    @PrimaryColumn({ type: 'varchar' })
    erpName!: string;

    // 'quantity', 'amount' or 'unconditional': the metrics getBestPercent knows how to evaluate.
    @Column({ type: 'varchar' })
    metric!: string;
}

// ERP operation kinds evaluable as a percent on the document's product list; any other non-empty kind is not applied.
@Entity()
export class DiscountOperationKind {
    @PrimaryColumn({ type: 'varchar' })
    erpName!: string;
}

// One ANDed condition of a filter-mode setup, normalised at write time (see classifySelectionFilter).
@Entity()
export class DiscountSetupFilterTerm {
    @PrimaryColumn({ type: 'int' })
    setupId!: number;

    @PrimaryColumn({ type: 'varchar' })
    side!: string;

    @PrimaryColumn({ type: 'int' })
    position!: number;

    @Column({ type: 'varchar' })
    field!: string;

    @Column({ type: 'boolean' })
    hierarchical!: boolean;

    @Column({ type: 'boolean' })
    negated!: boolean;

    @Column({ type: 'jsonb' })
    refs!: string[];
}
