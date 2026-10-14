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

    // One atomic upsert per variant, so a replayed or concurrent event cannot lose a write; a
    // missing reserveUntil never clears a known one (the field is optional on the stream).
    async record(
        ctx: RequestContext,
        orderId: ID,
        lines: ErpReservedLine[],
        reserveUntil: Date | null,
    ): Promise<void> {
        const byVariant = new Map<string, number>();
        for (const line of lines) {
            byVariant.set(
                line.productVariantId,
                (byVariant.get(line.productVariantId) ?? 0) + line.reservedQuantity,
            );
        }
        for (const [productVariantId, quantity] of byVariant) {
            await this.connection.getRepository(ctx, ErpOrderReserve).query(
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
    }

    findForOrder(ctx: RequestContext, orderId: ID): Promise<ErpOrderReserve[]> {
        return this.connection
            .getRepository(ctx, ErpOrderReserve)
            .find({ where: { orderId: String(orderId) } });
    }
}
