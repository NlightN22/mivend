import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import type { InboundStream } from '../types';

export type IntegrationInboxEventStatus = 'pending' | 'processing' | 'processed' | 'failed';

// Durable inbox for the inbound half of the Kafka exchange with Integration Service (issue #62
// Milestone 1, the external-integration-rules skill). The Kafka consumer only ever writes a row here — never
// processes an event inline — and a separate BullMQ worker sweeps `pending` rows for real
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
@Index('integration_inbox_event_pending', ['status', 'createdAt'])
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
}
