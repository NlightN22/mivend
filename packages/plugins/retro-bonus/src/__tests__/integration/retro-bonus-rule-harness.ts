import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import type { RetroBonusSetupInput } from '../../retro-bonus-rule.service';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy, so the rule table is hand-rolled.
@Entity('retro_bonus_rule')
@Index(['erpId'], { unique: true })
export class TestRetroBonusRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', default: '' }) documentNumber!: string;
    @Column({ type: 'boolean', default: false }) isInstant!: boolean;
    @Column({ type: 'varchar', nullable: true }) accrualPeriod!: string | null;
    @Column({ type: 'int', default: 0 }) accrualDayNumber!: number;
    @Column({ type: 'varchar', default: '' }) accrualKind!: string;
    @Column({ type: 'double precision' }) percent!: number;
    @Column({ type: 'double precision', nullable: true }) conditionAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) organizationErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientCounterpartyErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientContractErpId!: string | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'boolean', default: true }) active!: boolean;
    @Column({ type: 'varchar', nullable: true }) inactiveReason!: string | null;
    @Column({ type: 'boolean', default: false }) allCounterparties!: boolean;
    @Column({ type: 'boolean', default: false }) allProducts!: boolean;
    @Column({ type: 'varchar', default: 'list' }) counterpartyMode!: string;
    @Column({ type: 'varchar', default: 'list' }) productMode!: string;
    @Column({ type: 'jsonb', nullable: true }) counterpartyFilter!: unknown[] | null;
    @Column({ type: 'jsonb', nullable: true }) productFilter!: unknown[] | null;
    @Column({ type: 'varchar' }) sourceVersion!: string;
    @Column({ type: 'varchar', length: 64 }) contentHash!: string;
}

export function input(
    version: string,
    counterpartyErpIds: string[],
    productErpIds: string[] = ['p1'],
    overrides: Partial<RetroBonusSetupInput['rule']> = {},
    erpId = 'doc-1',
): RetroBonusSetupInput {
    return {
        rule: {
            erpId,
            documentNumber: '1',
            isInstant: false,
            accrualPeriod: null,
            accrualDayNumber: 0,
            accrualKind: 'by-sale',
            percent: 2,
            conditionAmount: null,
            conditionQuantity: null,
            priceTypeErpId: null,
            organizationErpId: null,
            recipientCounterpartyErpId: null,
            recipientContractErpId: null,
            validFrom: new Date('2026-01-01T00:00:00Z'),
            validTo: null,
            allCounterparties: false,
            allProducts: false,
            counterpartyMode: 'list',
            productMode: 'list',
            counterpartyFilter: null,
            productFilter: null,
            sourceVersion: version,
            ...overrides,
        },
        counterpartyErpIds,
        productErpIds,
    };
}
