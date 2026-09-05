import { Injectable, Logger } from '@nestjs/common';
import {
    RequestContext,
    StockLevel,
    StockLevelService,
    TransactionalConnection,
} from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationStockHandler';

// Applies Integration Service's `stock` stream (StockChanged: productId/warehouseId/quantity/
// reservedQuantity/availableQuantity). Now per-location (issue #63's Warehouse/StockLocation
// migration, replacing the earlier single-default-location simplification): warehouseId resolves
// to a real StockLocation via Warehouse.erpId -> StockLocation.customFields.warehouseErpId
// (WarehouseStreamHandler's own idempotency key). `quantity` (the physical on-hand count) maps to
// StockLevel.stockOnHand. `availableQuantity` maps to StockLevel.customFields.erpAvailableQuantity
// (issue #72) — 1C's own ATP number, used by ReservationAvailabilityService to cap mivend's local
// ATP, since 1C receives reservations from other channels mivend never sees as events.
// `reservedQuantity` still has no destination — issue #72's revised ATP formula only needs 1C's
// *available* number as a ceiling, not its own reserved breakdown.
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
        const quantity = Number(payload.quantity ?? NaN);
        const availableQuantity =
            payload.availableQuantity != null ? Number(payload.availableQuantity) : null;
        const isDeleted = payload.isDeleted === true;
        if (!productId || !warehouseId || Number.isNaN(quantity)) {
            Logger.warn(
                `stock ${entityId}: missing productId/warehouseId/quantity, skipping`,
                loggerCtx,
            );
            return;
        }
        if (isDeleted) {
            Logger.verbose(`stock ${entityId}: deleted, skipping`, loggerCtx);
            return;
        }

        const warehouse = await this.warehouseService.findByErpId(ctx, warehouseId);
        if (!warehouse) {
            Logger.warn(
                `stock ${entityId}: no Warehouse found for warehouseId=${warehouseId}, skipping`,
                loggerCtx,
            );
            return;
        }

        const stockLocationId = await this.findStockLocationId(warehouseId);
        if (!stockLocationId) {
            Logger.warn(
                `stock ${entityId}: no StockLocation found for warehouseId=${warehouseId}, skipping`,
                loggerCtx,
            );
            return;
        }

        const variantId = await this.findVariantId(productId);
        if (!variantId) {
            Logger.warn(
                `stock ${entityId}: variant not found for productId=${productId}`,
                loggerCtx,
            );
            return;
        }

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
        if (
            availableQuantity != null &&
            current.customFields?.erpAvailableQuantity !== Math.round(availableQuantity)
        ) {
            current.customFields = {
                ...current.customFields,
                erpAvailableQuantity: Math.round(availableQuantity),
            };
            await this.connection.getRepository(ctx, StockLevel).save(current);
        }
        Logger.verbose(
            `Updated stock productId=${productId} warehouseId=${warehouseId} qty=${stockOnHand} ` +
                `erpAvailable=${availableQuantity ?? 'n/a'}`,
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
