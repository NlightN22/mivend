import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { HealOutcome } from '../reconciliation-heal-policy';
import type { ComparisonState } from '../reconciliation-state';

// One row per compared aggregate: the latest comparison and the healing bookkeeping. Written under
// an aggregate lock (ReconciliationStateService); counts and gap come from the run, never from a UI.
@Entity()
export class ErpReconciliationState extends UuidEntity {
    constructor(input?: DeepPartial<ErpReconciliationState>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    aggregateType!: string;

    @Column({ type: 'varchar' })
    state!: ComparisonState;

    @Column({ type: 'varchar', nullable: true })
    reason!: string | null;

    @Column({ type: 'int' })
    ourCount!: number;

    @Column({ type: 'int' })
    theirCount!: number;

    @Column({ type: 'int' })
    gap!: number;

    @Column({ type: 'int', default: 0 })
    flatRuns!: number;

    @Column({ type: 'timestamp', nullable: true })
    seedingSince!: Date | null;

    @Column({ type: 'boolean', default: false })
    seedingAlarm!: boolean;

    @Column({ type: 'int', nullable: true })
    inboxBacklog!: number | null;

    @Column({ type: 'int', nullable: true })
    sourceQueue!: number | null;

    @Column({ type: 'timestamp' })
    lastRunAt!: Date;

    @Column({ type: 'int', default: 0 })
    healAttempts!: number;

    // Claimed before the request is sent, so a second runner sees the throttle.
    @Column({ type: 'timestamp', nullable: true })
    healRequestedAt!: Date | null;

    @Column({ type: 'varchar', nullable: true })
    healOutcome!: HealOutcome | null;

    @Column({ type: 'varchar', nullable: true })
    healDetail!: string | null;

    @Column({ type: 'boolean', nullable: true })
    healRealRun!: boolean | null;
}
