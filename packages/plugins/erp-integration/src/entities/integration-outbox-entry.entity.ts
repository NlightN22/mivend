import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// skipped: the event could not be built (never published, rebuilt later); resolved: a skipped row
// whose event was rebuilt and queued.
export type IntegrationOutboxStatus = 'pending' | 'published' | 'failed' | 'skipped' | 'resolved';

@Entity('integration_outbox')
@Index('integration_outbox_pending', ['createdAt'], { where: '"status" = \'pending\'' })
export class IntegrationOutboxEntry {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: number;

    @Index({ unique: true })
    @Column({ type: 'uuid', name: 'event_id' })
    eventId!: string;

    @Column({ type: 'varchar', name: 'event_type' })
    eventType!: string;

    @Column({ type: 'jsonb' })
    payload!: Record<string, unknown>;

    @Column({ type: 'varchar', default: 'pending' })
    status!: IntegrationOutboxStatus;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @Column({ type: 'timestamptz', name: 'published_at', nullable: true })
    publishedAt!: Date | null;

    @Column({ type: 'int', name: 'retry_count', default: 0 })
    retryCount!: number;

    @Column({ type: 'text', name: 'last_error', nullable: true })
    lastError!: string | null;

    @Column({ type: 'timestamptz', name: 'last_error_at', nullable: true })
    lastErrorAt!: Date | null;

    @Column({ type: 'timestamptz', name: 'first_failed_at', nullable: true })
    firstFailedAt!: Date | null;

    @Column({ type: 'timestamptz', name: 'next_retry_at', nullable: true })
    nextRetryAt!: Date | null;
}
