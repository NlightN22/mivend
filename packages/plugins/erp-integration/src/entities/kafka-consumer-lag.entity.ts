import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Written by the worker-side poller; the main-process admin query reads it, so it must be persisted.
// null committedOffset means unknown (no commit yet), not lag 0; never default it. lag is null too.
@Entity()
@Index(['topic', 'partition'], { unique: true })
export class KafkaConsumerLagEntry extends VendureEntity {
    constructor(input?: DeepPartial<KafkaConsumerLagEntry>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    topic!: string;

    @Column({ type: 'varchar' })
    stream!: string;

    @Column({ type: 'int' })
    partition!: number;

    @Column({ type: 'varchar', nullable: true })
    committedOffset!: string | null;

    @Column({ type: 'varchar' })
    endOffset!: string;

    @Column({ type: 'varchar', nullable: true })
    lag!: string | null;

    @Column({ type: 'timestamp' })
    polledAt!: Date;
}
