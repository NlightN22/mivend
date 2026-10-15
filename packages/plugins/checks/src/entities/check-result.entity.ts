import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { FindingSeverity } from '../types';

@Entity()
@Index(['subjectType', 'subjectId', 'stage'])
export class CheckResult extends UuidEntity {
    constructor(input?: DeepPartial<CheckResult>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    subjectType!: string;

    @Column({ type: 'varchar' })
    subjectId!: string;

    @Column({ type: 'varchar' })
    checkCode!: string;

    @Column({ type: 'varchar', nullable: true })
    stage!: string | null;

    @Column({ type: 'varchar', nullable: true })
    lineRef!: string | null;

    @Column({ type: 'varchar' })
    severity!: FindingSeverity;

    @Column({ type: 'varchar' })
    messageKey!: string;

    @Column({ type: 'jsonb' })
    facts!: Record<string, unknown>;

    @Column({ type: 'varchar', nullable: true })
    dataVersion!: string | null;

    @Column({ type: 'timestamp' })
    computedAt!: Date;

    @Column({ type: 'boolean', default: false })
    stale!: boolean;
}
