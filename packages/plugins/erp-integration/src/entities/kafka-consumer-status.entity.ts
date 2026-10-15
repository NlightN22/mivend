import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

// Kafka consumer runs only in the worker process; the status endpoint is served by a separate
// process with no shared memory, so the isConnected() flag is invisible; this row bridges it.
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
