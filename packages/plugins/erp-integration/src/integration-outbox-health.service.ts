import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HELD_SKIP_REASON } from './order-checks/order-send-hold.service';
import { mergeOutboxHealth } from './outbox-health';
import type { OutboxHealthByEventType } from './outbox-health';

@Injectable()
export class IntegrationOutboxHealthService {
    constructor(private readonly dataSource: DataSource) {}

    async getHealthByEventType(): Promise<OutboxHealthByEventType[]> {
        const rows: OutboxHealthByEventType[] = await this.dataSource.query(
            `
            SELECT
                e.event_type AS "eventType",
                COUNT(*) FILTER (WHERE e.status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE e.status = 'failed')::int AS failed,
                COUNT(*) FILTER (WHERE e.status = 'skipped' AND e.last_error IS DISTINCT FROM $1)::int AS skipped,
                COUNT(*) FILTER (WHERE e.status = 'skipped' AND e.last_error = $1)::int AS held,
                MIN(e.created_at) FILTER (WHERE e.status = 'pending') AS "oldestPendingAt",
                MAX(e.published_at) AS "lastPublishedAt",
                (ARRAY_AGG(e.last_error ORDER BY e.last_error_at DESC)
                    FILTER (WHERE e.last_error IS NOT NULL AND e.status IN ('pending', 'failed')))[1]
                    AS "lastError",
                MAX(e.last_error_at) FILTER (WHERE e.status IN ('pending', 'failed')) AS "lastErrorAt",
                (ARRAY_AGG(e.last_error ORDER BY e.last_error_at DESC)
                    FILTER (WHERE e.status = 'skipped' AND e.last_error IS DISTINCT FROM $1))[1]
                    AS "lastSkipReason"
            FROM integration_outbox e
            WHERE NOT (e.status = 'skipped' AND e.event_type = 'order.confirmed' AND EXISTS (
                SELECT 1 FROM "order" o WHERE o.id::text = e.payload ->> 'orderId' AND o.state = 'Cancelled'))
            GROUP BY e.event_type
            ORDER BY e.event_type
        `,
            [HELD_SKIP_REASON],
        );
        return mergeOutboxHealth(rows);
    }
}
