import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Accessed only through raw SQL (bulk-batch.sql.ts); do not add a repository path beside it.
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

    // Per-record input of this batch; an undo batch gets it from the original record's undoData.
    @Column({ type: 'jsonb', nullable: true })
    input!: Record<string, unknown> | null;

    // What apply() recorded so an undo can restore this record; null when nothing is needed.
    @Column({ type: 'jsonb', nullable: true })
    undoData!: Record<string, unknown> | null;
}
