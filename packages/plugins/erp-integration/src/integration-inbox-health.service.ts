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
    oldestPendingAt: Date | null;
}

// Read models for the integration-health page (backlog and no-op counts), split from
// IntegrationInboxService so the claim/retry code stays small.
@Injectable()
export class IntegrationInboxHealthService {
    constructor(private readonly dataSource: DataSource) {}

    // Dashboard read model (issue #91's "integration health" page) — how many rows per stream are
    // sitting unprocessed right now. Deliberately a different question from Kafka lag: these rows
    // were already consumed from Kafka and had their offset committed — this is Postgres-side
    // processing backlog, not broker-side lag, and the two numbers are expected to disagree (a
    // consumer can be fully caught up with Kafka while a huge inbox backlog waits on a slow/backed
    // up processor, or vice versa during a burst).
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
                statuses: ['pending', 'processing', 'failed'],
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
                oldestPendingAt: null,
            };
            if (row.oldestPending) entry.oldestPendingAt = new Date(row.oldestPending);
            entry[row.status as 'pending' | 'processing' | 'failed'] = Number(row.count);
            byStream.set(row.stream, entry);
        }
        return [...byStream.values()];
    }

    // Messages a handler deliberately did nothing for in the last 24 h, per stream (#200) — a
    // different question from backlog: these are processed rows, counted so a stream that drops
    // everything it receives is visible.
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
