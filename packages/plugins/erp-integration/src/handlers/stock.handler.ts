import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    StockLevel,
    StockLevelService,
    TransactionalConnection,
} from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';
import { ctxQuery } from 'shared';

import { MissingDependencyError } from '../types';
import { isWarehouseTombstoned } from './warehouse-tombstone.query';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationStockHandler';

// Applies the `stock` stream: quantity -> StockLevel.stockOnHand, availableQuantity -> erpAvailableQuantity (#72).
// Plain proto3 doubles omit zero from JSON, so an absent quantity/availableQuantity means 0 (see types.ts).
@Injectable()
export class StockStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly warehouseService: WarehouseService,
        private readonly stockLevelService: StockLevelService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const productId = String(payload.productId ?? '');
        const warehouseId = String(payload.warehouseId ?? '');
        const quantity = Number(payload.quantity ?? 0);
        const availableQuantity = Number(payload.availableQuantity ?? 0);
        const isDeleted = payload.isDeleted === true;
        if (!productId || !warehouseId) {
            return inboundNoop(`stock ${entityId}: missing productId/warehouseId, skipping`);
        }
        if (isDeleted) {
            return inboundNoop(`stock ${entityId}: deleted, skipping`);
        }

        const warehouse = await this.warehouseService.findByErpId(ctx, warehouseId);
        if (!warehouse) {
            if (await isWarehouseTombstoned(this.connection, ctx, warehouseId)) {
                return inboundNoop(
                    `stock ${entityId}: warehouse ${warehouseId} is deleted upstream, ignoring`,
                );
            }
            // Ordering race: the warehouse event is not consumed yet (#96), so retry.
            throw new MissingDependencyError(
                `stock ${entityId}: no Warehouse found for warehouseId=${warehouseId}`,
            );
        }

        const stockLocationId = await this.findStockLocationId(ctx, warehouseId);
        if (!stockLocationId) {
            throw new MissingDependencyError(
                `stock ${entityId}: no StockLocation found for warehouseId=${warehouseId}`,
            );
        }

        const variantId = await this.findVariantId(ctx, productId);
        if (!variantId) {
            throw new MissingDependencyError(
                `stock ${entityId}: variant not found for productId=${productId}`,
            );
        }

        // Single read reused for the delta and the ATP write; safe while one worker sweeps the inbox (audit.72).
        const stockOnHand = Math.round(quantity);
        const current = await this.stockLevelService.getStockLevel(ctx, variantId, stockLocationId);
        const change = stockOnHand - current.stockOnHand;
        if (change !== 0) {
            await this.stockLevelService.updateStockOnHandForLocation(
                ctx,
                variantId,
                stockLocationId,
                change,
            );
        }
        if (current.customFields?.erpAvailableQuantity !== Math.round(availableQuantity)) {
            // Targeted update: saving `current` would write its stale stockOnHand back over the delta above.
            await this.connection
                .getRepository(ctx, StockLevel)
                .update(
                    { id: current.id },
                    { customFields: { erpAvailableQuantity: Math.round(availableQuantity) } },
                );
        }
        Logger.verbose(
            `Updated stock productId=${productId} warehouseId=${warehouseId} qty=${stockOnHand} ` +
                `erpAvailable=${availableQuantity}`,
            loggerCtx,
        );
        return inboundApplied();
    }

    private async findVariantId(
        ctx: RequestContext,
        productId: string,
    ): Promise<string | undefined> {
        const [row] = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT pv.id FROM product_variant pv
               INNER JOIN product p ON p.id = pv."productId"
              WHERE p."customFieldsExternalid" = $1`,
            [productId],
        );
        return row?.id;
    }

    private async findStockLocationId(
        ctx: RequestContext,
        warehouseErpId: string,
    ): Promise<string | undefined> {
        const [row] = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT sl.id FROM stock_location sl WHERE sl."customFieldsWarehouseerpid" = $1`,
            [warehouseErpId],
        );
        return row?.id;
    }
}
