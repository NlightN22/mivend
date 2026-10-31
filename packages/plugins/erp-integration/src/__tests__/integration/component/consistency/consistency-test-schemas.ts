import { EntitySchema } from 'typeorm';

import { ConsistencyReport } from '../../../../consistency/consistency-report.entity';
import { ConsistencySourceState } from '../../../../consistency/consistency-source-state.entity';

// VendureEntity's id column is only wired up by Vendure's own bootstrap, so the tables are mapped here.
const base = {
    id: { type: Number, primary: true, generated: true },
    createdAt: { type: 'timestamp', createDate: true },
    updatedAt: { type: 'timestamp', updateDate: true },
    uuid: { type: 'uuid', unique: true },
} as const;
const timestamptz = { type: 'timestamptz' } as const;
export const reportSchema = new EntitySchema({
    name: 'ConsistencyReport',
    target: ConsistencyReport,
    tableName: 'consistency_report',
    columns: {
        ...base,
        number: { type: Number, generated: 'increment' },
        source: { type: String },
        providerIssueId: { type: String, name: 'provider_issue_id' },
        type: { type: String },
        severity: { type: String },
        entityType: { type: String, name: 'entity_type' },
        entityId: { type: String, name: 'entity_id' },
        scope: { type: 'jsonb', default: () => "'{}'" },
        expected: { type: 'jsonb', nullable: true },
        actual: { type: 'jsonb', nullable: true },
        details: { type: 'text', default: '' },
        replayable: { type: Boolean, default: false },
        occurrences: { type: Number, default: 1 },
        firstDetectedAt: { ...timestamptz, name: 'first_detected_at' },
        lastDetectedAt: { ...timestamptz, name: 'last_detected_at' },
        resolvedAt: { ...timestamptz, name: 'resolved_at', nullable: true },
        status: { type: String, default: 'open' },
    },
    uniques: [{ columns: ['source', 'providerIssueId'] }],
});
export const stateSchema = new EntitySchema({
    name: 'ConsistencySourceState',
    target: ConsistencySourceState,
    tableName: 'consistency_source_state',
    columns: {
        ...base,
        source: { type: String, unique: true },
        health: { type: String },
        healthDetail: { type: 'text', name: 'health_detail', default: '' },
        summary: { type: 'jsonb', nullable: true },
        lastFinishedAt: { ...timestamptz, name: 'last_finished_at', nullable: true },
        watermark: { ...timestamptz, nullable: true },
        lastPolledAt: { ...timestamptz, name: 'last_polled_at', nullable: true },
        lastSuccessAt: { ...timestamptz, name: 'last_success_at', nullable: true },
    },
});
