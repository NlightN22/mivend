import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import type { InboundStream } from '../types';

// replay_requested: a failed row whose entity was replayed, waiting for the new event to be
// processed; resolved: that event was processed (docs/integration-health.md).
export type IntegrationInboxEventStatus =
    | 'pending'
    | 'processing'
    | 'processed'
    | 'failed'
    | 'replay_requested'
    | 'resolved';

// Kafka consumer only writes here; a scheduled sweeper processes pending rows, never inline.
// Dedup on (stream, sourceEventId): version can repeat across different events for one entity.
@Entity('integration_inbox_event')
@Index('integration_inbox_event_dedup', ['stream', 'sourceEventId'], { unique: true })
// Serves the stale-'processing'-reclaim branch of claimBatch (#147/#148).
@Index('integration_inbox_event_claim', ['stream', 'status', 'eligibleAt'])
// Serves claimBatch's per-stream 'pending' branches — see findClaimCandidateIds and
// docs/environments.md's #148 note (took the claim query from ~3.4s to ~7ms).
@Index('integration_inbox_event_claim_pending', ['stream', 'eligibleAt'], {
    where: `"status" = 'pending'`,
})
// Per-row superseded-version check (processor); without it each check seq-scans the table (#146).
@Index('integration_inbox_event_entity', ['stream', 'entityId', 'status'])
// Serves the per-stream no-op summary on the integration-health page (#200).
@Index('integration_inbox_event_noop', ['stream', 'processedAt'], { where: `"outcome" = 'noop'` })
// Serves the retention sweep's duplicate-group scan (ordered, so LIMIT stops early).
@Index('integration_inbox_event_retention', ['stream', 'entityId'], {
    where: `"status" = 'processed' AND "payload" <> '{}'::jsonb`,
})
export class IntegrationInboxEvent {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: number;

    @Column({ type: 'varchar' })
    stream!: InboundStream;

    @Column({ type: 'varchar', name: 'entity_id' })
    entityId!: string;

    // version is an opaque string from Integration Service, not guaranteed fixed-width or zero-padded.
    // Compare as text; coercing to bigint would break ordering.
    @Column({ type: 'varchar' })
    version!: string;

    // Integration Service's event id, kept so rows can be reconciled against its outbound ledger.
    // Not the dedup key; exists for external reconciliation even when dedup is no longer needed.
    @Column({ type: 'varchar', name: 'source_event_id' })
    sourceEventId!: string;

    // Store the full decoded payload, not just the fields the current handler uses.
    // Lets a later handler revision reprocess history and lets dead-lettered rows be inspected.
    @Column({ type: 'jsonb' })
    payload!: Record<string, unknown>;

    @Column({ type: 'varchar', default: 'pending' })
    status!: IntegrationInboxEventStatus;

    @Column({ type: 'int', default: 0 })
    attempts!: number;

    @Column({ type: 'text', name: 'last_error', nullable: true })
    lastError!: string | null;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
    updatedAt!: Date;

    @Column({ type: 'timestamptz', name: 'processed_at', nullable: true })
    processedAt!: Date | null;

    // How a processed row ended: applied, superseded by a newer version, a deliberate no-op
    // (#200), or dismissed by a human (#212). Null on rows processed before this column existed.
    @Column({ type: 'varchar', name: 'outcome', nullable: true })
    outcome!: 'applied' | 'superseded' | 'noop' | 'dismissed' | null;

    @Column({ type: 'timestamptz', name: 'replay_requested_at', nullable: true })
    replayRequestedAt!: Date | null;

    @Column({ type: 'text', name: 'outcome_reason', nullable: true })
    outcomeReason!: string | null;

    // Backoff gate for `claimBatch`, set by IntegrationInboxService.markFailed; null means
    // immediately eligible.
    @Column({ type: 'timestamptz', name: 'next_retry_at', nullable: true })
    nextRetryAt!: Date | null;

    // Written only by insertRejectedInboxRow's decode-failure branch and never updated afterwards.
    // Marks "no entity id to replay" independently of lastError, which failed replays overwrite.
    @Column({ type: 'boolean', default: false })
    undecodable!: boolean;

    // Start of the 24h retry budget — the first failure, not enqueue time, so a backlog that
    // waited out a long outage still gets its retries (#145).
    @Column({ type: 'timestamptz', name: 'first_failed_at', nullable: true })
    firstFailedAt!: Date | null;

    // claimBatch's sole ordering column (#147) — enqueue time on insert, nextRetryAt on every
    // backoff (IntegrationInboxService.markFailed). Replaces the un-indexable COALESCE expression.
    @Column({ type: 'timestamptz', name: 'eligible_at', default: () => 'now()' })
    eligibleAt!: Date;

    // Set by claimBatch; only the worker holding it may settle the row, so a slow worker whose
    // claim was reclaimed cannot overwrite the new claimant's outcome.
    @Column({ type: 'uuid', name: 'claim_token', nullable: true })
    claimToken!: string | null;
}
