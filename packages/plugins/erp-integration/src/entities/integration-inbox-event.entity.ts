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
// Unique on (stream, entityId, version) per issue #62's design section 2 — this is both the
// consumer's dedup key (a redelivered/duplicate Kafka message for the same entity version is a
// no-op) and the ordering guard: a handler must reject/ignore a version lower than what it has
// already applied for that (stream, entityId), so out-of-order redelivery never regresses state.
@Entity('integration_inbox_event')
@Index('integration_inbox_event_dedup', ['stream', 'entityId', 'version'], { unique: true })
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

    // Integration Service's own event/message id (the external-integration-rules skill — an external reference
    // distinct in purpose from the (stream, entityId, version) dedup key above, even though both
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
