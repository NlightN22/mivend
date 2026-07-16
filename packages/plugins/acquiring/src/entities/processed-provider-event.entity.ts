import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['provider', 'providerEventId'], { unique: true })
export class ProcessedProviderEvent extends VendureEntity {
    constructor(input?: DeepPartial<ProcessedProviderEvent>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    provider!: string;

    @Column({ type: 'varchar' })
    providerEventId!: string;

    @Column({ type: 'varchar' })
    payloadHash!: string;

    @Column({ type: 'timestamp' })
    processedAt!: Date;
}
