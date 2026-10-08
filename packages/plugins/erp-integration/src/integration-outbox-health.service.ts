import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface OutboxHealthByEventType {
    eventType: string;
    pending: number;
    failed: number;
    oldestPendingAt: Date | null;
    lastPublishedAt: Date | null;
    lastError: string | null;
    lastErrorAt: Date | null;
}

@Injectable()
export class IntegrationOutboxHealthService {
    constructor(private readonly dataSource: DataSource) {}

    async getHealthByEventType(): Promise<OutboxHealthByEventType[]> {
        return this.dataSource.query(`
            SELECT
                e.event_type AS "eventType",
                COUNT(*) FILTER (WHERE e.status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE e.status = 'failed')::int AS failed,
                MIN(e.created_at) FILTER (WHERE e.status = 'pending') AS "oldestPendingAt",
                MAX(e.published_at) AS "lastPublishedAt",
                (ARRAY_AGG(e.last_error ORDER BY e.last_error_at DESC)
                    FILTER (WHERE e.last_error IS NOT NULL))[1] AS "lastError",
                MAX(e.last_error_at) AS "lastErrorAt"
            FROM integration_outbox e
            GROUP BY e.event_type
            ORDER BY e.event_type
        `);
    }
}
