import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// One result row per record; outcome stays null until the runner reaches it.
@Entity()
@Index(['batchId', 'targetId'], { unique: true })
export class BulkBatchItem extends VendureEntity {
    constructor(input?: DeepPartial<BulkBatchItem>) {
        super(input);
    }

    @Column({ type: 'int' })
    batchId!: number;

    @Column({ type: 'varchar' })
    targetId!: string;

    @Column({ type: 'varchar', nullable: true })
    label!: string | null;

    @Column({ type: 'varchar' })
    previewOutcome!: string;

    @Column({ type: 'varchar', nullable: true })
    previewReasonCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    outcome!: string | null;

    @Column({ type: 'varchar', nullable: true })
    reasonCode!: string | null;

    @Column({ type: 'text', nullable: true })
    message!: string | null;
}
