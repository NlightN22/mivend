import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ErpReconciliationIssueType = 'upstream-higher' | 'local-higher';
export type ErpReconciliationIssueStatus = 'open' | 'resolved';
export type ErpReconciliationTrigger = 'scheduled' | 'manual';

// Entity-completeness drift between mivend's own counts and Integration Service's reconciliation
// summary endpoint (issue #84) — never auto-resolved, mirrors ReservationReconciliationIssue/
// PaymentReconciliationIssue's own "escalate, don't guess" shape (docs/testing-patterns.md's
// "Source ownership" pattern). Deliberately its own table, not folded into either of those: this
// is entity-completeness (do we have as many of X as Integration Service does), not a
// reservation-quantity or payment-amount mismatch — a different domain, per AGENTS.md's
// no-speculative-abstraction rule.
//
// Only two issue types are detectable with a count-only summary endpoint (no per-entity diff):
// 'upstream-higher' (Integration Service has more active entities than mivend — flag for a human
// to request a replay via Search Platform's own operator-only resync tooling, since no automated
// point-lookup/replay API exists) and 'local-higher' (mivend has more than Integration Service —
// flag for review, e.g. a stale/orphaned local record; never auto-deleted).
@Entity()
export class ErpReconciliationIssue extends VendureEntity {
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

    // Named after the summary endpoint's own `activeCount` field, not `count` — comparisons must
    // use activeCount everywhere except storageLocation, which has no active/inactive concept at
    // all (see ReconciliationSummaryClient's own comment).
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
