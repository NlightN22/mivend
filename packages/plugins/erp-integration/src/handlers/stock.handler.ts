import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    StockLevel,
    StockLevelService,
    TransactionalConnection,
} from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';

import type { InboundStreamHandler } from './inbound-stream-handler';
import { MissingDependencyError } from '../types';
import { isWarehouseTombstoned } from './warehouse-tombstone.query';

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
    ): Promise<void> {
        const productId = String(payload.productId ?? '');
        const warehouseId = String(payload.warehouseId ?? '');
        const quantity = Number(payload.quantity ?? 0);
        const availableQuantity = Number(payload.availableQuantity ?? 0);
        const isDeleted = payload.isDeleted === true;
        if (!productId || !warehouseId) {
            Logger.warn(`stock ${entityId}: missing productId/warehouseId, skipping`, loggerCtx);
            return;
        }
        if (isDeleted) {
            Logger.verbose(`stock ${entityId}: deleted, skipping`, loggerCtx);
            return;
        }

        const warehouse = await this.warehouseService.findByErpId(ctx, warehouseId);
        if (!warehouse) {
            if (await isWarehouseTombstoned(this.connection.rawConnection, warehouseId)) {
                Logger.verbose(
                    `stock ${entityId}: warehouse ${warehouseId} is deleted upstream, ignoring`,
                    loggerCtx,
                );
                return;
            }
            // Ordering race: the warehouse event is not consumed yet (#96), so retry.
            throw new MissingDependencyError(
                `stock ${entityId}: no Warehouse found for warehouseId=${warehouseId}`,
            );
        }

        const stockLocationId = await this.findStockLocationId(warehouseId);
        if (!stockLocationId) {
            throw new MissingDependencyError(
                `stock ${entityId}: no StockLocation found for warehouseId=${warehouseId}`,
            );
        }

        const variantId = await this.findVariantId(productId);
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
    }

    private async findVariantId(productId: string): Promise<string | undefined> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<{ id: string }>();
        return row?.id;
    }

    private async findStockLocationId(warehouseErpId: string): Promise<string | undefined> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('sl.id', 'id')
            .from('stock_location', 'sl')
            .where('sl."customFieldsWarehouseerpid" = :erpId', { erpId: warehouseErpId })
            .getRawOne<{ id: string }>();
        return row?.id;
    }
}
