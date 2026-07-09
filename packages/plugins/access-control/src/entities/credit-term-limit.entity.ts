import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// How far a role may extend a counterparty's payment term on their own authority, before a
// creditTermApproval request must escalate to security review — data, not code, same
// reasoning as RoleAccessScope. One row per role code.
@Entity()
export class CreditTermLimit extends VendureEntity {
    constructor(input?: DeepPartial<CreditTermLimit>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    roleCode!: string;

    @Column({ type: 'int' })
    maxExtraDays!: number;

    // Decimal amount in the smallest currency unit — nullable because a role's limit may be
    // days-only, with no separate amount ceiling.
    @Column({ type: 'bigint', nullable: true })
    maxAmount!: number | null;
}
