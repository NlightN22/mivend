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

    async getReservedQuantity(
        ctx: RequestContext,
        productVariantId: ID,
        branchId?: string | null,
    ): Promise<number> {
        const stockLocationIds = await this.resolveStockLocationIds(ctx, branchId);
        return this.sumActiveReservations(ctx, productVariantId, stockLocationIds);
    }

    // ATP = stockOnHand - stockAllocated - activeReservations, summed across every StockLocation
    // that resolves for the given branchId (its Warehouses' StockLocations — see
    // BranchStockLocationStrategy/WarehouseService in plugin-erp-integration/plugin-access-
    // control), no safetyStock term (docs/order-flow.md "ATP formula (decided)"). branchId is
    // optional and falls back to the single default StockLocation — the pre-multi-warehouse
    // behavior — for callers that don't yet have a branch to scope by.
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
        const stockOnHand = stockLevels.reduce((sum, level) => sum + level.stockOnHand, 0);
        const stockAllocated = stockLevels.reduce((sum, level) => sum + level.stockAllocated, 0);
        const reserved = await this.sumActiveReservations(ctx, productVariantId, stockLocationIds);
        return stockOnHand - stockAllocated - reserved;
    }

    private async sumActiveReservations(
        ctx: RequestContext,
        productVariantId: ID,
        stockLocationIds: string[],
    ): Promise<number> {
        const rows = await this.connection.getRepository(ctx, Reservation).find({
            where: stockLocationIds.map(stockLocationId => ({
                productVariantId: String(productVariantId),
                stockLocationId,
                status: 'active' as const,
            })),
        });
        return rows.reduce((sum, r) => sum + r.quantity, 0);
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
