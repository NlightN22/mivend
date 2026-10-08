import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import type { IntegrationInboxEventStatus } from './entities/integration-inbox-event.entity';
import type { InboundStream } from './types';

export interface IntegrationInboxNoopByStream {
    stream: string;
    count: number;
    lastReason: string | null;
}

export interface IntegrationInboxBacklogByStream {
    stream: InboundStream;
    pending: number;
    processing: number;
    failed: number;
    replayPending: number;
    oldestPendingAt: Date | null;
}

// Read models for the integration-health page (backlog and no-op counts), split from
// IntegrationInboxService so the claim/retry code stays small.
@Injectable()
export class IntegrationInboxHealthService {
    constructor(private readonly dataSource: DataSource) {}

    // Unprocessed inbox rows per stream: Postgres-side backlog, deliberately a different number
    // from Kafka lag (docs/integration-health.md).
    async getBacklogByStream(): Promise<IntegrationInboxBacklogByStream[]> {
        const rows = await this.dataSource
            .getRepository(IntegrationInboxEvent)
            .createQueryBuilder('event')
            .select('event.stream', 'stream')
            .addSelect('event.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .addSelect(
                `MIN(CASE WHEN event.status = 'pending' THEN event.createdAt END)`,
                'oldestPending',
            )
            .where('event.status IN (:...statuses)', {
                statuses: ['pending', 'processing', 'failed', 'replay_requested'],
            })
            .groupBy('event.stream')
            .addGroupBy('event.status')
            .getRawMany<{
                stream: InboundStream;
                status: IntegrationInboxEventStatus;
                count: string;
                oldestPending: Date | null;
            }>();

        const byStream = new Map<InboundStream, IntegrationInboxBacklogByStream>();
        for (const row of rows) {
            const entry = byStream.get(row.stream) ?? {
                stream: row.stream,
                pending: 0,
                processing: 0,
                failed: 0,
                replayPending: 0,
                oldestPendingAt: null,
            };
            if (row.oldestPending) entry.oldestPendingAt = new Date(row.oldestPending);
            if (row.status === 'replay_requested') entry.replayPending = Number(row.count);
            else entry[row.status as 'pending' | 'processing' | 'failed'] = Number(row.count);
            byStream.set(row.stream, entry);
        }
        return [...byStream.values()];
    }

    // Processed rows whose handler recorded a no-op in the last 24 h, per stream (#200).
    async getNoopSummaryByStream(): Promise<IntegrationInboxNoopByStream[]> {
        return this.dataSource.query(`
            SELECT stream,
                   COUNT(*)::int AS count,
                   (ARRAY_AGG(outcome_reason ORDER BY processed_at DESC))[1] AS "lastReason"
            FROM integration_inbox_event
            WHERE outcome = 'noop' AND processed_at > now() - interval '24 hours'
            GROUP BY stream
        `);
    }
}
