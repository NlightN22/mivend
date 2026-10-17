import { withAggregateLock } from 'shared';
import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { ErpOrderReserve } from './entities/erp-order-reserve.entity';

export interface ErpReservedLine {
    productVariantId: string;
    reservedQuantity: number;
}

@Injectable()
export class ErpOrderReserveService {
    constructor(private connection: TransactionalConnection) {}

    // Upserts per variant in one transaction; deletes variants the ERP no longer reports only when
    // replaceSet (no event line was discarded). A missing reserveUntil never clears a known one (optional on the stream).
    async record(
        ctx: RequestContext,
        orderId: ID,
        lines: ErpReservedLine[],
        reserveUntil: Date | null,
        replaceSet = true,
    ): Promise<void> {
        const byVariant = new Map<string, number>();
        for (const line of lines) {
            byVariant.set(
                line.productVariantId,
                (byVariant.get(line.productVariantId) ?? 0) + line.reservedQuantity,
            );
        }
        if (byVariant.size === 0) return;
        await withAggregateLock(
            this.connection,
            ctx,
            `erp-reserve:${String(orderId)}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, ErpOrderReserve);
                for (const [productVariantId, quantity] of byVariant) {
                    await repo.query(
                        `INSERT INTO erp_order_reserve
                       ("uuid", "orderId", "productVariantId", "quantity", "reserveUntil")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4)
                     ON CONFLICT ("orderId", "productVariantId") DO UPDATE SET
                       "quantity" = EXCLUDED."quantity",
                       "reserveUntil" = COALESCE(EXCLUDED."reserveUntil", erp_order_reserve."reserveUntil"),
                       "updatedAt" = now()`,
                        [String(orderId), productVariantId, quantity, reserveUntil],
                    );
                }
                if (!replaceSet) return;
                await repo.query(
                    `DELETE FROM erp_order_reserve
                  WHERE "orderId" = $1 AND NOT ("productVariantId" = ANY($2::text[]))`,
                    [String(orderId), [...byVariant.keys()]],
                );
            },
        );
    }

    findForOrder(ctx: RequestContext, orderId: ID): Promise<ErpOrderReserve[]> {
        return this.connection
            .getRepository(ctx, ErpOrderReserve)
            .find({ where: { orderId: String(orderId) } });
    }
}
