import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import type { ExchangeHealth, ExchangeState } from '../exchange-health';

// Single row (key 'exchange'): written by the worker poller, read by the main-process admin query.
@Entity()
@Index(['key'], { unique: true })
export class ExchangeHealthSnapshot extends VendureEntity {
    constructor(input?: DeepPartial<ExchangeHealthSnapshot>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    key!: string;

    @Column({ type: 'varchar' })
    state!: ExchangeState;

    @Column({ type: 'varchar', nullable: true })
    reason!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    health!: ExchangeHealth | null;

    @Column({ type: 'timestamp' })
    polledAt!: Date;
}
