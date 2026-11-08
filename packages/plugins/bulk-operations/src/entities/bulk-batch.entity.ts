import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Generated, Index } from 'typeorm';

// The numeric human number is the table's own sequence, never MAX+1 (docs/identifiers.md).
@Entity()
@Index(['createdById', 'selectionHash'], { unique: true, where: `"status" = 'draft'` })
@Index(['undoOfBatchId'], { unique: true, where: '"undoOfBatchId" IS NOT NULL' })
export class BulkBatch extends UuidEntity {
    constructor(input?: DeepPartial<BulkBatch>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'int' })
    @Generated('increment')
    number!: number;

    @Index()
    @Column({ type: 'varchar' })
    operationType!: string;

    @Column({ type: 'jsonb', default: () => "'{}'" })
    parameters!: Record<string, unknown>;

    @Column({ type: 'varchar', default: 'draft' })
    status!: string;

    @Column({ type: 'varchar' })
    createdById!: string;

    @Column({ type: 'int', nullable: true })
    undoOfBatchId!: number | null;

    @Column({ type: 'varchar' })
    selectionHash!: string;

    @Column({ type: 'int', default: 0 })
    totalCount!: number;

    @Column({ type: 'int', default: 0 })
    appliedCount!: number;

    @Column({ type: 'int', default: 0 })
    skippedCount!: number;

    @Column({ type: 'int', default: 0 })
    failedCount!: number;

    @Column({ type: 'timestamp', nullable: true })
    startedAt!: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    finishedAt!: Date | null;

    @Column({ type: 'text', nullable: true })
    errorMessage!: string | null;
}
