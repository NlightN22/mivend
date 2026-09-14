import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// One row per (topic, partition), upserted by KafkaLagPollerService's own ScheduledTask —
// same "bridge across the worker/main-process boundary via a persisted row" shape as
// KafkaConsumerStatus, since the poller (like the consumer itself) only ever runs in the worker
// process while the admin GraphQL query resolving this is served by the main HTTP process. See
// kafka-consumer-status.entity.ts's own doc comment for the underlying reason.
//
// committedOffset is null when the consumer group has never committed an offset for this
// partition yet (a brand-new group, or a partition that has received no traffic through this
// group) — that is a genuinely different, unknown state from "lag is 0", so it is never defaulted
// to a number. lag mirrors that: null whenever committedOffset is null.
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
