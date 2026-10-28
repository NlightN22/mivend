import { Column, Entity, PrimaryColumn } from 'typeorm';

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
