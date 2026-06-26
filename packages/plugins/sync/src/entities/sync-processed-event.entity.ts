import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sync_processed_event')
export class SyncProcessedEvent {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: number;

    @Index({ unique: true })
    @Column({ type: 'uuid', name: 'event_id' })
    eventId!: string;

    @Column({ type: 'timestamptz', name: 'processed_at', default: () => 'NOW()' })
    processedAt!: Date;
}
