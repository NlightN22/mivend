import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    RequestContext,
    StockLevel,
    StockLocation,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { IsNull } from 'typeorm';
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

    // ATP = stockOnHand - stockAllocated - unconfirmedActiveReservations, capped per-location at
    // 1C's own availableQuantity where known (issue #72's revised formula) — 1C is the sole
    // source of truth for reservations, since it receives holds from other channels that never
    // reach mivend as events at all. Once 1C confirms a mivend reservation
    // (Reservation.erpConfirmedAt set, via the existing order-status callback — docs/order-flow.md
    // stages 5-6), it stops being subtracted locally: 1C's own availableQuantity is trusted to
    // already reflect it, so it isn't subtracted twice (once locally, once inside 1C's own
    // number). The cap is applied PER StockLocation, not after summing across locations — 1C's
    // availableQuantity is itself location-scoped (StockChanged is per warehouse), so capping
    // after summing would mix numbers from different scopes.
    //
    // No cap is applied for a location 1C has never reported a StockChanged for
    // (erpAvailableQuantity still null) — falls back to the local-only number for that location,
    // same bootstrap behavior as every other ERP-sourced field in this codebase.
    //
    // KNOWN RESIDUAL RISK (mivend.audit.72 HIGH, deliberately not fixed here): a real oversell
    // window exists if 1C's StockChanged confirming a hold is delayed or dropped after
    // erpConfirmedAt is set — neither the (now-excluded) local reservation nor erpAvailableQuantity
    // reflects the held unit until 1C's own event catches up. This is the direct tradeoff of
    // "trust 1C once confirmed" (the decided design, see issue #72's discussion) — fixing it
    // properly needs either a bounded grace-period fallback or #73's nightly reconciliation
    // worker to catch and correct the drift, not a change to this method alone. Flagged for a
    // deliberate decision, not silently patched.
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
        const unconfirmedReservedByLocation = await this.sumUnconfirmedReservationsByLocation(
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
                (unconfirmedReservedByLocation.get(locationId) ?? 0);
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

    // Sums ALL active reservations regardless of erpConfirmedAt (mivend.audit.72 MEDIUM: this is
    // deliberately NOT the same set getAvailableToPromise subtracts, which only counts
    // *unconfirmed* ones — confirmed reservations are trusted to already be inside 1C's own
    // availableQuantity, see that method's own comment). This method answers "how much do we
    // currently hold, full stop" (informational/reporting), not "how much should still be
    // subtracted from ATP." Do not reuse this for an ATP-adjacent calculation without checking
    // which of the two questions is actually being asked.
    async getReservedQuantity(
        ctx: RequestContext,
        productVariantId: ID,
        branchId?: string | null,
    ): Promise<number> {
        const stockLocationIds = await this.resolveStockLocationIds(ctx, branchId);
        const rows = await this.connection.getRepository(ctx, Reservation).find({
            where: stockLocationIds.map(stockLocationId => ({
                productVariantId: String(productVariantId),
                stockLocationId,
                status: 'active' as const,
            })),
        });
        return rows.reduce((sum, r) => sum + r.quantity, 0);
    }

    private async sumUnconfirmedReservationsByLocation(
        ctx: RequestContext,
        productVariantId: ID,
        stockLocationIds: string[],
    ): Promise<Map<string, number>> {
        const rows = await this.connection.getRepository(ctx, Reservation).find({
            where: stockLocationIds.map(stockLocationId => ({
                productVariantId: String(productVariantId),
                stockLocationId,
                status: 'active' as const,
                erpConfirmedAt: IsNull(),
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
