import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export interface CheckPolicySnapshot {
    consequence: string;
    recipient: string | null;
    enabled: boolean;
}

export interface CheckPolicyRemoved {
    removed: true;
}

@Entity()
export class CheckPolicyHistory extends UuidEntity {
    constructor(input?: DeepPartial<CheckPolicyHistory>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    checkPolicyId!: number;

    @Column({ type: 'varchar', nullable: true })
    changedByUserId!: string | null;

    @Column({ type: 'jsonb' })
    before!: CheckPolicySnapshot;

    @Column({ type: 'jsonb' })
    after!: CheckPolicySnapshot | CheckPolicyRemoved;
}
