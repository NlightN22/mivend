import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sync_outbox')
@Index('sync_outbox_pending', ['createdAt'], { where: '"status" = \'pending\'' })
export class SyncOutboxEntry {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: number;

    @Index({ unique: true })
    @Column({ type: 'uuid', name: 'event_id' })
    eventId!: string;

    @Column({ type: 'varchar', name: 'event_type' })
    eventType!: string;

    @Column({ type: 'jsonb' })
    payload!: Record<string, unknown>;

    @Column({ type: 'varchar' })
    target!: string;

    @Column({ type: 'varchar', default: 'pending' })
    status!: 'pending' | 'delivered' | 'failed';

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true })
    deliveredAt!: Date | null;

    @Column({ type: 'int', name: 'retry_count', default: 0 })
    retryCount!: number;

    @Column({ type: 'text', name: 'last_error', nullable: true })
    lastError!: string | null;

    @Column({ type: 'timestamptz', name: 'last_error_at', nullable: true })
    lastErrorAt!: Date | null;
}
