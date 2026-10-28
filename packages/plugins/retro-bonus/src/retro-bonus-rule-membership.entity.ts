import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// No foreign key: the rule row is never deleted and the list is replaced under the rule's advisory lock.
@Entity()
@Index(['counterpartyErpId', 'ruleId'])
export class RetroBonusRuleCounterparty {
    @PrimaryColumn({ type: 'int' })
    ruleId!: number;

    @PrimaryColumn({ type: 'varchar' })
    counterpartyErpId!: string;
}

@Entity()
@Index(['productErpId', 'ruleId'])
export class RetroBonusRuleProduct {
    @PrimaryColumn({ type: 'int' })
    ruleId!: number;

    @PrimaryColumn({ type: 'varchar' })
    productErpId!: string;
}

// One ANDed condition of a filter-mode rule, normalised at write time (see classifySelectionFilter).
@Entity()
export class RetroBonusRuleFilterTerm {
    @PrimaryColumn({ type: 'int' })
    ruleId!: number;

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
