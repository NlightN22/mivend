import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { CONTRACT_PAYMENT_KINDS } from './entities/proforma-invoice.entity';

export type BeforeContractProformaDelete = (txCtx: RequestContext, ids: number[]) => Promise<void>;

// Contract proformas are unlimited paper (#260); old ones are removed, order proformas never are.
@Injectable()
export class ContractProformaPurgeService {
    constructor(private connection: TransactionalConnection) {}

    async purgeBatch(
        ctx: RequestContext,
        retentionMonths: number,
        limit: number,
        beforeDelete: BeforeContractProformaDelete,
    ): Promise<number> {
        return this.connection.withTransaction(ctx, async txCtx => {
            const rows = await ctxQuery<{ id: number }[]>(
                this.connection,
                txCtx,
                `SELECT id FROM proforma_invoice
                 WHERE kind = ANY($1) AND "orderId" IS NULL
                   AND "issuedAt" < now() - make_interval(months => $2)
                 ORDER BY id LIMIT $3 FOR UPDATE SKIP LOCKED`,
                [CONTRACT_PAYMENT_KINDS, retentionMonths, limit],
            );
            const ids = rows.map(r => Number(r.id));
            if (ids.length === 0) return 0;
            await beforeDelete(txCtx, ids);
            await ctxQuery(
                this.connection,
                txCtx,
                `DELETE FROM proforma_invoice WHERE id = ANY($1) AND kind = ANY($2) AND "orderId" IS NULL`,
                [ids, CONTRACT_PAYMENT_KINDS],
            );
            return ids.length;
        });
    }
}
