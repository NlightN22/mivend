import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Orders whose erpStatus is a rejected one in the status dictionary — issue #204 item 4.
@Injectable()
export class RejectedOrderHealthService {
    constructor(private readonly dataSource: DataSource) {}

    async getRejectedCount(): Promise<number> {
        const [row] = await this.dataSource.query(`
            SELECT COUNT(*)::int AS "rejected"
              FROM "order" o
             WHERE o."customFieldsErpstatus" IN (
                   SELECT code FROM order_status_reference WHERE rejected AND NOT "isDeleted")
        `);
        return row.rejected;
    }
}
