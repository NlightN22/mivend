import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { ctxQuery } from 'shared';

export const CHECK_RUN_FAILED = 'check-run-failed';
const FAILURE_WINDOW_DAYS = 7;

export interface OrderCheckHealthRow {
    checkCode: string;
    reason: string | null;
    orderCount: number;
    staleOrderCount: number;
}

// Orders with a stored failing ERP-requirement finding, per check code and reason (#237).
@Injectable()
export class OrderCheckHealthService {
    constructor(private readonly connection: TransactionalConnection) {}

    async getHealth(ctx: RequestContext): Promise<OrderCheckHealthRow[]> {
        const rows = await ctxQuery<OrderCheckHealthRow[]>(
            this.connection,
            ctx,
            `
            SELECT cr."checkCode" AS "checkCode",
                   cr.facts->>'reason' AS reason,
                   COUNT(DISTINCT cr."subjectId")::int AS "orderCount",
                   COUNT(DISTINCT cr."subjectId") FILTER (WHERE cr.stale)::int AS "staleOrderCount"
              FROM check_result cr
              JOIN "order" o ON o.id::text = cr."subjectId"
             WHERE cr."subjectType" = 'order' AND cr."checkCode" LIKE 'erp.%'
               AND cr.severity = 'error' AND o.state <> 'Cancelled'
             GROUP BY cr."checkCode", cr.facts->>'reason'
             ORDER BY cr."checkCode", reason
        `,
        );
        return [...rows, ...(await this.getRunFailures(ctx))];
    }

    // Orders whose check run errored recently and was skipped (fail-open): "a check did not run".
    private getRunFailures(ctx: RequestContext): Promise<OrderCheckHealthRow[]> {
        return ctxQuery<OrderCheckHealthRow[]>(
            this.connection,
            ctx,
            `
            SELECT '${CHECK_RUN_FAILED}' AS "checkCode", f.stage AS reason,
                   COUNT(DISTINCT f."orderId")::int AS "orderCount", 0 AS "staleOrderCount"
              FROM order_check_failure f
             WHERE f."createdAt" > now() - interval '${FAILURE_WINDOW_DAYS} days'
             GROUP BY f.stage
             ORDER BY f.stage
        `,
        );
    }
}
