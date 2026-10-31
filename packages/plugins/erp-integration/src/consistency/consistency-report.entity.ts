import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Generated, Index } from 'typeorm';

// Provider-reported drift, one row per (source, provider issue id); resolved rows stay as history.
// Written only by raw SQL in ConsistencyReportStore; this class is the schema and the read model.
@Entity('consistency_report')
@Index('consistency_report_source_issue', ['source', 'providerIssueId'], { unique: true })
@Index('consistency_report_number', ['number'], { unique: true })
@Index('consistency_report_list', ['status', 'lastDetectedAt'])
@Index('consistency_report_retention', ['resolvedAt'], { where: `"status" = 'resolved'` })
export class ConsistencyReport extends UuidEntity {
    constructor(input?: DeepPartial<ConsistencyReport>) {
        super(input);
    }

    // Human reference from a database sequence; never an idempotency key.
    @Generated('increment')
    @Column({ type: 'int' })
    number!: number;

    @Column({ type: 'varchar' })
    source!: string;

    @Column({ type: 'varchar', name: 'provider_issue_id' })
    providerIssueId!: string;

    @Column({ type: 'varchar' })
    type!: string;

    @Column({ type: 'varchar' })
    severity!: string;

    @Column({ type: 'varchar', name: 'entity_type' })
    entityType!: string;

    @Column({ type: 'varchar', name: 'entity_id' })
    entityId!: string;

    @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
    scope!: Record<string, string>;

    @Column({ type: 'jsonb', nullable: true })
    expected!: unknown;

    @Column({ type: 'jsonb', nullable: true })
    actual!: unknown;

    @Column({ type: 'text', default: '' })
    details!: string;

    @Column({ type: 'boolean', default: false })
    replayable!: boolean;

    @Column({ type: 'int', default: 1 })
    occurrences!: number;

    @Column({ type: 'timestamptz', name: 'first_detected_at' })
    firstDetectedAt!: Date;

    @Column({ type: 'timestamptz', name: 'last_detected_at' })
    lastDetectedAt!: Date;

    @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
    resolvedAt!: Date | null;

    @Column({ type: 'varchar', default: 'open' })
    status!: 'open' | 'resolved';
}
