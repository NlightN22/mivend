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
//
// `available_quantity` is a plain (non-optional) proto3 `double` in Integration Service's
// contract — same zero-value-omission shape as `isActive`/`isDeleted` documented in types.ts's
// InboundStream comment, just for a numeric field instead of a bool: when the value is exactly
// 0, @bufbuild/protobuf's JSON encoder OMITS the key entirely rather than sending `0`. Reading
// `payload.availableQuantity != null` therefore silently drops every message where 1C reports
// zero available stock — the exact case the ATP cap most needs to catch (mivend.issue.84.88,
// confirmed live: 68 production stock rows had a real applied event with no erpAvailableQuantity
// ever written, because the field was 0 and absent from JSON, not missing). The correct read
// treats an absent key as an explicit 0, never as "no data" — same fix shape as `payload.isActive
// === true` elsewhere in this plugin. `expectedQuantity` (unused here) IS declared `optional` in
// the same schema and does carry real presence — this zero-omission issue is specific to fields
// declared as plain scalars, not a blanket "treat every absent numeric field as 0" rule.
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
        // `quantity` is a plain (non-optional) proto3 double, same zero-value-omission shape as
        // `availableQuantity` above — an absent key means "reported as 0", never "malformed
        // payload". A prior revision defaulted this to NaN and treated NaN as malformed, which
        // silently dropped the whole event (not just the ATP cap) for every genuine "stock hit
        // zero" fact — confirmed live: 4 processed stock events with no `quantity` key at all
        // (mivend.issue.84.88, 2026-09-15). productId/warehouseId remain real malformed-payload
        // checks (string fields have no zero-value-omission ambiguity — an empty/absent one is
        // unambiguously invalid here).
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
            // Issue #96: an ordinary eventual-consistency race, not a processing bug — the
            // warehouse stream's own event for this erpId simply hasn't been consumed yet. Throw
            // so processOne() routes this through the backoff/retry path instead of silently
            // dropping the event.
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

        // mivend.audit.72 MEDIUM: `current` is a single point-in-time read reused below for both
        // the stockOnHand delta and the erpAvailableQuantity write — a lost-update race is
        // possible in principle if two StockChanged messages for the same StockLevel were applied
        // concurrently. `processPendingBatch`'s own sequential for-loop (no Promise.all) rules
        // this out within one worker process; a genuinely concurrent write would need a second
        // worker PROCESS (BullMQ replica) claiming rows from the same inbox at the same time —
        // not something this comment can rule out on its own, since it depends on how many worker
        // replicas this plugin is actually deployed with. Flagging as an accepted risk rather than
        // adding row-locking here until that's confirmed one way or the other — see mivend.audit.72.
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
            current.customFields = {
                ...current.customFields,
                erpAvailableQuantity: Math.round(availableQuantity),
            };
            await this.connection.getRepository(ctx, StockLevel).save(current);
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
