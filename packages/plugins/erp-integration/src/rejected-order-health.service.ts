import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Order.customFields.erpStatus (plugin-erp-order's ERP_ORDER_STATUSES) — issue #204 item 4.
@Injectable()
export class RejectedOrderHealthService {
    constructor(private readonly dataSource: DataSource) {}

    async getRejectedCount(): Promise<number> {
        const [row] = await this.dataSource.query(`
            SELECT COUNT(*)::int AS "rejected"
              FROM "order" o
             WHERE o."customFieldsErpstatus" = 'REJECTED'
        `);
        return row.rejected;
    }
}
