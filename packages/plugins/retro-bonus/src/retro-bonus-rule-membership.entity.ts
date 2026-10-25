import { Entity, Index, PrimaryColumn } from 'typeorm';

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
