import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface OrderCheckHealthRow {
    checkCode: string;
    reason: string | null;
    orderCount: number;
    staleOrderCount: number;
}

// Orders with a stored failing ERP-requirement finding, per check code and reason (#237).
@Injectable()
export class OrderCheckHealthService {
    constructor(private readonly dataSource: DataSource) {}

    getHealth(): Promise<OrderCheckHealthRow[]> {
        return this.dataSource.query(`
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
        `);
    }
}
