import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { ctxQuery } from 'shared';

// Orders whose erpStatus is a rejected one in the status dictionary — issue #204 item 4.
@Injectable()
export class RejectedOrderHealthService {
    constructor(private readonly connection: TransactionalConnection) {}

    async getRejectedCount(ctx: RequestContext): Promise<number> {
        const [row] = await ctxQuery<Array<{ rejected: number }>>(
            this.connection,
            ctx,
            `
            SELECT COUNT(*)::int AS "rejected"
              FROM "order" o
             WHERE o."customFieldsErpstatus" IN (
                   SELECT code FROM order_status_reference WHERE rejected AND NOT "isDeleted")
        `,
        );
        return row.rejected;
    }
}
