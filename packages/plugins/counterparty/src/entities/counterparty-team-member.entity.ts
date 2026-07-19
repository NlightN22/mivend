import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// A small, fixed technical set of internal RBAC roles — not ERP-sourced business data, see
// AGENTS.md's "Business data must live in the database" section for why this is exempt.
export type CounterpartyTeamMemberRole = 'backup' | 'observer' | 'accounting-contact';

// Extra managers beyond Counterparty.assignedManagerId (the Owner) who can also see this
// counterparty as "their own" for AccessScopeService's own-scope resolution. The Owner field is
// unchanged and stays the single reassignable "primary" relationship — this entity only adds
// additional team members on top of it. See docs/access-control.md and
// AccessScopeService.applyOwnCounterpartyFilter for how membership is folded into scope checks.
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
