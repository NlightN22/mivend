import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { mergeOutboxHealth } from './outbox-health';
import type { OutboxHealthByEventType } from './outbox-health';

@Injectable()
export class IntegrationOutboxHealthService {
    constructor(private readonly dataSource: DataSource) {}

    async getHealthByEventType(): Promise<OutboxHealthByEventType[]> {
        const rows: OutboxHealthByEventType[] = await this.dataSource.query(`
            SELECT
                e.event_type AS "eventType",
                COUNT(*) FILTER (WHERE e.status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE e.status = 'failed')::int AS failed,
                COUNT(*) FILTER (WHERE e.status = 'skipped')::int AS skipped,
                MIN(e.created_at) FILTER (WHERE e.status = 'pending') AS "oldestPendingAt",
                MAX(e.published_at) AS "lastPublishedAt",
                (ARRAY_AGG(e.last_error ORDER BY e.last_error_at DESC)
                    FILTER (WHERE e.last_error IS NOT NULL AND e.status IN ('pending', 'failed')))[1]
                    AS "lastError",
                MAX(e.last_error_at) FILTER (WHERE e.status IN ('pending', 'failed')) AS "lastErrorAt",
                (ARRAY_AGG(e.last_error ORDER BY e.last_error_at DESC)
                    FILTER (WHERE e.status = 'skipped'))[1] AS "lastSkipReason"
            FROM integration_outbox e
            GROUP BY e.event_type
            ORDER BY e.event_type
        `);
        return mergeOutboxHealth(rows);
    }
}
