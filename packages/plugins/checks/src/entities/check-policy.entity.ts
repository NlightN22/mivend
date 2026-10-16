import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { Consequence } from '../types';

@Entity()
@Index('IDX_check_policy_global', ['checkCode', 'stage'], {
    unique: true,
    where: '"branchId" IS NULL',
})
@Index('IDX_check_policy_branch', ['checkCode', 'stage', 'branchId'], {
    unique: true,
    where: '"branchId" IS NOT NULL',
})
export class CheckPolicy extends UuidEntity {
    constructor(input?: DeepPartial<CheckPolicy>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    checkCode!: string;

    @Column({ type: 'varchar' })
    stage!: string;

    // null is the global row; a branch row overrides it for orders of that branch.
    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    @Column({ type: 'varchar' })
    consequence!: Consequence;

    @Column({ type: 'varchar', nullable: true })
    recipient!: string | null;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;
}
