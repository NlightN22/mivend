import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    RequestContext,
    StockLevel,
    StockLocation,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';

import { Reservation } from './entities/reservation.entity';

// ATP (available-to-promise) read queries — split out of ReservationService to keep that file
// under AGENTS.md's ~300-line guideline. Pure reads, no reservation writes.
@Injectable()
export class ReservationAvailabilityService {
    private cachedStockLocationId: string | undefined;

    constructor(
        private connection: TransactionalConnection,
        private warehouseService: WarehouseService,
    ) {}

    // ATP = stockOnHand - stockAllocated - activeReservations, capped per-location at 1C's own
    // availableQuantity where known (issue #72's revised formula) — 1C is the sole source of
    // truth for reservations, since it receives holds from other channels that never reach
    // mivend as events at all, so its own number is the only defense against those.
    //
    // A local Reservation is subtracted for as long as it stays `status: 'active'` — REGARDLESS
    // of erpConfirmedAt. An earlier revision of this method stopped subtracting a reservation
    // once 1C confirmed it, reasoning that 1C's own availableQuantity would already reflect the
    // hold by then and double-subtracting would understate ATP. That reasoning solved a minor,
    // harmless problem (a slightly-too-conservative number) by creating a real one: if 1C's own
    // StockChanged confirming the hold was itself delayed or dropped, NEITHER number reflected
    // the held unit for that whole window — a genuine oversell risk (mivend.audit.72 HIGH).
    // Reverted per the same reasoning that makes the cap below safe in the first place: min() by
    // definition never double-subtracts, it only ever picks the more conservative of the two
    // numbers — so there was never anything to protect against. Keeping the local subtraction
    // permanent for the reservation's whole active lifetime closes that window entirely: the
    // held unit is accounted for locally from the moment it's created until it's actually
    // released or converted to stockAllocated, with 1C's own number only ever tightening the
    // cap further (for holds from OTHER channels mivend has no reservation row for at all), never
    // being the sole thing standing between "held" and "shown as free".
    //
    // The cap is applied PER StockLocation, not after summing across locations — 1C's
    // availableQuantity is itself location-scoped (StockChanged is per warehouse), so capping
    // after summing would mix numbers from different scopes. No cap is applied for a location 1C
    // has never reported a StockChanged for (erpAvailableQuantity still null) — falls back to the
    // local-only number for that location, same bootstrap behavior as every other ERP-sourced
    // field in this codebase.
    async getAvailableToPromise(
        ctx: RequestContext,
        productVariantId: ID,
        branchId?: string | null,
    ): Promise<number> {
        const stockLocationIds = await this.resolveStockLocationIds(ctx, branchId);
        const stockLevels = await this.connection.getRepository(ctx, StockLevel).find({
            where: stockLocationIds.map(stockLocationId => ({
                productVariantId,
                stockLocationId,
            })),
        });
        const reservedByLocation = await this.sumActiveReservationsByLocation(
            ctx,
            productVariantId,
            stockLocationIds,
        );

        let total = 0;
        for (const level of stockLevels) {
            const locationId = String(level.stockLocationId);
            const localFree =
                level.stockOnHand -
                level.stockAllocated -
                (reservedByLocation.get(locationId) ?? 0);
            const erpCap = level.customFields?.erpAvailableQuantity;
            const capped = erpCap != null ? Math.min(localFree, erpCap) : localFree;
            // Floored at 0 (mivend.audit.72 LOW) — a malformed/negative erpAvailableQuantity from
            // 1C (not expected under normal operation, but stock.handler.ts doesn't validate the
            // incoming value) must not turn into a negative contribution once summed across
            // locations, which would silently understate ATP for the whole branch.
            total += Math.max(0, capped);
        }
        return total;
    }

    async getReservedQuantity(
        ctx: RequestContext,
        productVariantId: ID,
        branchId?: string | null,
    ): Promise<number> {
        const stockLocationIds = await this.resolveStockLocationIds(ctx, branchId);
        const byLocation = await this.sumActiveReservationsByLocation(
            ctx,
            productVariantId,
            stockLocationIds,
        );
        return [...byLocation.values()].reduce((sum, qty) => sum + qty, 0);
    }

    private async sumActiveReservationsByLocation(
        ctx: RequestContext,
        productVariantId: ID,
        stockLocationIds: string[],
    ): Promise<Map<string, number>> {
        const rows = await this.connection.getRepository(ctx, Reservation).find({
            where: stockLocationIds.map(stockLocationId => ({
                productVariantId: String(productVariantId),
                stockLocationId,
                status: 'active' as const,
            })),
        });
        const byLocation = new Map<string, number>();
        for (const row of rows) {
            byLocation.set(
                row.stockLocationId,
                (byLocation.get(row.stockLocationId) ?? 0) + row.quantity,
            );
        }
        return byLocation;
    }

    // No branchId (or no Warehouse resolves for it — e.g. not yet synced): fall back to the
    // single default StockLocation, matching this service's pre-multi-warehouse behavior exactly
    // — a deliberate no-regression guarantee for callers that don't pass a branch.
    private async resolveStockLocationIds(
        ctx: RequestContext,
        branchId?: string | null,
    ): Promise<string[]> {
        if (!branchId) {
            return [await this.getDefaultStockLocationId(ctx)];
        }
        // includedInBranchAtp is the human-curated flag (issue #66) — isActive is only 1C's own
        // suggested default and has been observed to be an unreliable "holds real stock" signal
        // (a branch's largest-stock warehouse was flagged isActive=false in a real check), so it
        // is deliberately not part of this filter.
        const warehouses = (await this.warehouseService.findAll(ctx)).filter(
            w => w.branchId === branchId && w.includedInBranchAtp,
        );
        if (warehouses.length === 0) {
            return [await this.getDefaultStockLocationId(ctx)];
        }
        const warehouseErpIds = new Set(warehouses.map(w => w.erpId));
        const allLocations = await this.connection.getRepository(ctx, StockLocation).find();
        const locations = allLocations.filter(location =>
            warehouseErpIds.has(location.customFields?.warehouseErpId ?? ''),
        );
        if (locations.length === 0) {
            return [await this.getDefaultStockLocationId(ctx)];
        }
        return locations.map(l => String(l.id));
    }

    private async getDefaultStockLocationId(ctx: RequestContext): Promise<string> {
        if (this.cachedStockLocationId) {
            return this.cachedStockLocationId;
        }
        const location = await this.connection
            .getRepository(ctx, StockLocation)
            .createQueryBuilder()
            .getOne();
        if (!location) {
            throw new UserInputError('No stock location configured');
        }
        this.cachedStockLocationId = String(location.id);
        return this.cachedStockLocationId;
    }
}
