import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

// Plain mirrors of the rule tables (VendureEntity needs a bootstrapped id strategy); members are real columns.
@Entity('discount_setup')
@Index(['erpId'], { unique: true })
export class TestDiscountSetup {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', default: '' }) documentNumber!: string;
    @Column({ type: 'double precision' }) percent!: number;
    @Column({ type: 'varchar', default: '' }) conditionName!: string;
    @Column({ type: 'double precision', nullable: true }) conditionNumber!: number | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeErpId!: string | null;
    @Column({ type: 'double precision', nullable: true }) limitPercent!: number | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'boolean', default: true }) active!: boolean;
    @Column({ type: 'varchar', nullable: true }) inactiveReason!: string | null;
    @Column({ type: 'boolean', default: false }) allProducts!: boolean;
    @Column({ type: 'varchar', default: 'list' }) productMode!: string;
    @Column({ type: 'jsonb', nullable: true }) productFilter!: unknown[] | null;
    @Column({ type: 'varchar' }) sourceVersion!: string;
    @Column({ type: 'varchar', length: 64 }) contentHash!: string;
}

@Entity('discount_setup_recipient')
export class TestRecipient {
    @PrimaryColumn({ type: 'int' }) setupId!: number;
    @PrimaryColumn({ type: 'varchar', default: '' }) counterpartyErpId!: string;
    @PrimaryColumn({ type: 'varchar', default: '' }) contractErpId!: string;
}

@Entity('discount_setup_product')
export class TestSetupProduct {
    @PrimaryColumn({ type: 'int' }) setupId!: number;
    @PrimaryColumn({ type: 'varchar' }) productErpId!: string;
}

@Entity('retro_bonus_rule')
@Index(['erpId'], { unique: true })
export class TestRetroRule {
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

@Entity('retro_bonus_rule_counterparty')
export class TestRetroCounterparty {
    @PrimaryColumn({ type: 'int' }) ruleId!: number;
    @PrimaryColumn({ type: 'varchar' }) counterpartyErpId!: string;
}

@Entity('retro_bonus_rule_product')
export class TestRetroProduct {
    @PrimaryColumn({ type: 'int' }) ruleId!: number;
    @PrimaryColumn({ type: 'varchar' }) productErpId!: string;
}

@Entity('discount_setup_filter_term')
export class TestSetupFilterTerm {
    @PrimaryColumn({ type: 'int' }) setupId!: number;
    @PrimaryColumn({ type: 'varchar' }) side!: string;
    @PrimaryColumn({ type: 'int' }) position!: number;
    @Column({ type: 'varchar' }) field!: string;
    @Column({ type: 'boolean' }) hierarchical!: boolean;
    @Column({ type: 'boolean' }) negated!: boolean;
    @Column({ type: 'jsonb' }) refs!: string[];
}

@Entity('retro_bonus_rule_filter_term')
export class TestRetroFilterTerm {
    @PrimaryColumn({ type: 'int' }) ruleId!: number;
    @PrimaryColumn({ type: 'varchar' }) side!: string;
    @PrimaryColumn({ type: 'int' }) position!: number;
    @Column({ type: 'varchar' }) field!: string;
    @Column({ type: 'boolean' }) hierarchical!: boolean;
    @Column({ type: 'boolean' }) negated!: boolean;
    @Column({ type: 'jsonb' }) refs!: string[];
}
