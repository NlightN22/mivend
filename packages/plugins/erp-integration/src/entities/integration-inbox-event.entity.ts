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

// Durable inbox for the inbound half of the Kafka exchange with Integration Service (issue #62
// Milestone 1, the external-integration-rules skill). The Kafka consumer only ever writes a row here — never
// processes an event inline — and a separate scheduled task sweeps `pending` rows for real
// processing. `status` is a genuine per-row lifecycle, not a seen-boolean, per rule #12's
// explicit correction of the plugin-acquiring incident (see IncomingPaymentEvent for the
// original reference fix this mirrors).
//
// Unique on (stream, sourceEventId) — issue #89: previously (stream, entityId, version), which
// conflated two different jobs. `version` alone is not a safe uniqueness key: it's Integration
// Service's own entity-level timestamp, not a per-message id, and two genuinely different events
// for the same entity can carry an identical version value (confirmed live: a Search Platform
// backfill's deactivation event for a product shared its `version` with an earlier, unrelated
// update already stored for that entity — the old dedup key silently discarded the newer message
// with zero logging, because it only compared (stream, entityId, version), never payload
// content). `sourceEventId` is Integration Service's own real per-message event id (set from
// `record.eventId`/the Kafka message key — see kafka-consumer.service.ts) and is what a
// redelivered/duplicate message actually shares — the correct dedup key. `version` remains the
// out-of-order/regression guard (isSupersededByNewerVersion in
// integration-inbox-processor.service.ts still compares by (stream, entityId) + version, unrelated
// to this uniqueness constraint) — the two jobs were only ever conflated by living in the same
// index, not because they need the same key.
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
export class IntegrationInboxEvent {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: number;

    @Column({ type: 'varchar' })
    stream!: InboundStream;

    @Column({ type: 'varchar', name: 'entity_id' })
    entityId!: string;

    // Integration Service's own `version` field is a plain string (verified against
    // outbox-event-mapper.ts's `CommonFields.version: string` and search-service's own
    // `indexer_inbox.version: text` column) — not guaranteed to be a fixed-width/zero-padded
    // numeric string, so it is stored and compared as text, never coerced to bigint.
    @Column({ type: 'varchar' })
    version!: string;

    // Integration Service's own event/message id (per the external-integration-rules skill —
    // this field is an external reference distinct in purpose from the (stream, entityId,
    // version) dedup key above, even though both
    // may end up pointing at "the same" logical event: this field exists so a human/automated
    // process can reconcile a MiVend row against Integration Service's own outbound_commands-style
    // ledger, independent of whether dedup is still needed).
    @Column({ type: 'varchar', name: 'source_event_id' })
    sourceEventId!: string;

    // Raw decoded JSON payload, kept verbatim (not just the fields the current handler uses) so a
    // future handler revision can reprocess history, and so a dead-lettered row carries everything
    // needed for manual inspection.
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

    // Start of the 24h retry budget — the first failure, not enqueue time, so a backlog that
    // waited out a long outage still gets its retries (#145).
    @Column({ type: 'timestamptz', name: 'first_failed_at', nullable: true })
    firstFailedAt!: Date | null;

    // claimBatch's sole ordering column (#147) — enqueue time on insert, nextRetryAt on every
    // backoff (IntegrationInboxService.markFailed). Replaces the un-indexable COALESCE expression.
    @Column({ type: 'timestamptz', name: 'eligible_at', default: () => 'now()' })
    eligibleAt!: Date;
}
