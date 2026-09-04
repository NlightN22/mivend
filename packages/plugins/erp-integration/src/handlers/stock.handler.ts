import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationStockHandler';

// Applies Integration Service's `stock` stream (StockChanged: productId/warehouseId/quantity/
// reservedQuantity/availableQuantity, not sku/stockOnHand — issue #63). Variant lookup is by
// product externalId (single-variant-per-product assumption, matching ProductStreamHandler's
// default-variant creation).
//
// warehouseId maps to a per-warehouse Warehouse/StockLocation entity that does not exist yet in
// this codebase (issue #62's design notes; only a single default StockLocation exists per
// docs/ai/PROJECT_CONTEXT.md). Deliberate simplification: every warehouse's stock is folded into
// the one existing default stock_level row, using availableQuantity (the closest existing
// single-location analog to real ATP) — not a full multi-warehouse implementation, which is
// future work tied to the StockLocation-per-warehouse migration.
@Injectable()
export class StockStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        _ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const productId = String(payload.productId ?? '');
        const availableQuantity = Number(payload.availableQuantity ?? NaN);
        const isDeleted = payload.isDeleted === true;
        if (!productId || Number.isNaN(availableQuantity)) {
            Logger.warn(
                `stock ${entityId}: missing productId/availableQuantity, skipping`,
                loggerCtx,
            );
            return;
        }
        if (isDeleted) {
            Logger.verbose(`stock ${entityId}: deleted, skipping`, loggerCtx);
            return;
        }

        const variant = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<{ id: string }>();

        if (!variant) {
            Logger.warn(
                `stock ${entityId}: variant not found for productId=${productId}`,
                loggerCtx,
            );
            return;
        }

        const stockOnHand = Math.round(availableQuantity);
        await this.connection.rawConnection
            .createQueryBuilder()
            .update('stock_level')
            .set({ stockOnHand })
            .where('"productVariantId" = :id', { id: variant.id })
            .execute();
        Logger.verbose(`Updated stock productId=${productId} qty=${stockOnHand}`, loggerCtx);
    }
}
