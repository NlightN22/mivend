import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type ErpReconciliationIssueType = 'upstream-higher' | 'local-higher';
export type ErpReconciliationIssueStatus = 'open' | 'resolved';
export type ErpReconciliationTrigger = 'scheduled' | 'manual';

// Never auto-resolved: upstream-higher needs a human replay via operator-only resync (no point API).
// local-higher is flagged for review and never auto-deleted (may be stale or orphaned).
@Entity()
export class ErpReconciliationIssue extends UuidEntity {
    constructor(input?: DeepPartial<ErpReconciliationIssue>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    issueType!: ErpReconciliationIssueType;

    @Index()
    @Column({ type: 'varchar' })
    aggregateType!: string;

    @Column({ type: 'int' })
    ourCount!: number;

    // Comparisons must use activeCount, not count, except for storageLocation,
    // which has no active/inactive concept.
    @Column({ type: 'int' })
    theirActiveCount!: number;

    @Column({ type: 'timestamp' })
    detectedAt!: Date;

    @Column({ type: 'varchar', default: 'open' })
    status!: ErpReconciliationIssueStatus;

    @Column({ type: 'varchar', nullable: true })
    resolution!: string | null;

    @Column({ type: 'varchar' })
    triggeredBy!: ErpReconciliationTrigger;

    // Set only when triggeredBy === 'manual' — who forced the immediate re-check.
    @Column({ type: 'varchar', nullable: true })
    triggeredByAdministratorId!: string | null;
}
