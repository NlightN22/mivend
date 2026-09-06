import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

// Single-row status table (fixed id='default') — the ONLY way to expose the Kafka consumer's
// live connection state across the process boundary: KafkaConsumerService only ever runs in the
// worker process (ProcessContext.isWorker, see kafka-consumer-bootstrap.service.ts), while
// KafkaStatusController is served by the main HTTP process. They are separate Node processes
// with no shared memory — isConnected()'s in-memory flag is invisible from the other side, so
// this row is what actually bridges it.
@Entity()
export class KafkaConsumerStatus extends VendureEntity {
    constructor(input?: DeepPartial<KafkaConsumerStatus>) {
        super(input);
    }

    @Column({ type: 'varchar', unique: true })
    key!: string;

    @Column({ type: 'boolean' })
    connected!: boolean;
}
