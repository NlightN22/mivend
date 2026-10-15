import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Small fixed set of internal RBAC roles, not ERP-sourced business data, so it is
// exempt from the rule that business data must live in the database.
export type CounterpartyTeamMemberRole = 'backup' | 'observer' | 'accounting-contact';

// assignedManagerId stays the single reassignable Owner; this only adds extra managers
// who also count as own-scope, folded in by AccessScopeService.applyOwnCounterpartyFilter.
@Entity()
@Index(['counterpartyId', 'administratorId'], { unique: true })
export class CounterpartyTeamMember extends VendureEntity {
    constructor(input?: DeepPartial<CounterpartyTeamMember>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar' })
    administratorId!: string;

    @Column({ type: 'varchar' })
    role!: CounterpartyTeamMemberRole;

    @Column({ type: 'varchar', nullable: true })
    phone!: string | null;
}
