import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Last summary and mivend-computed health per source; also holds the poll watermark.
@Entity('consistency_source_state')
@Index('consistency_source_state_source', ['source'], { unique: true })
export class ConsistencySourceState extends UuidEntity {
    constructor(input?: DeepPartial<ConsistencySourceState>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    source!: string;

    @Column({ type: 'varchar' })
    health!: string;

    @Column({ type: 'text', name: 'health_detail', default: '' })
    healthDetail!: string;

    @Column({ type: 'jsonb', nullable: true })
    summary!: unknown;

    @Column({ type: 'timestamptz', name: 'last_finished_at', nullable: true })
    lastFinishedAt!: Date | null;

    // Max lastDetectedAt of a fully paged poll; the next poll sends it as `since` (inclusive).
    @Column({ type: 'timestamptz', nullable: true })
    watermark!: Date | null;

    @Column({ type: 'timestamptz', name: 'last_polled_at', nullable: true })
    lastPolledAt!: Date | null;

    @Column({ type: 'timestamptz', name: 'last_success_at', nullable: true })
    lastSuccessAt!: Date | null;
}
