import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { In } from 'typeorm';
import {
    RequestContext,
    StockLevel,
    StockLocation,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { WarehouseService } from '@mivend/plugin-access-control';

import { Reservation } from './entities/reservation.entity';
import { freeQuantity } from './free-stock';

// ATP (available-to-promise) read queries — split out of ReservationService to keep that file
// under AGENTS.md's ~300-line guideline. Pure reads, no reservation writes.
@Injectable()
export class ReservationAvailabilityService {
    private cachedStockLocationId: string | undefined;

    constructor(
        private connection: TransactionalConnection,
        private warehouseService: WarehouseService,
    ) {}

    // ATP = onHand - allocated - active reservations, capped per location at the ERP's availableQuantity.
    // Decision history: docs/order-flow.md "Available-to-promise formula".
    async getAvailableToPromise(
        ctx: RequestContext,
        productVariantId: ID,
        branchId?: string | null,
    ): Promise<number> {
        const byVariant = await this.getAvailableToPromiseBatch(ctx, [productVariantId], branchId);
        return byVariant.get(String(productVariantId)) ?? 0;
    }

    // Same ATP formula as above for many variants at once (one query per table, not per
    // variant) — what a catalog page needs. Variants with no StockLevel row map to 0.
    async getAvailableToPromiseBatch(
        ctx: RequestContext,
        productVariantIds: ID[],
        branchId?: string | null,
        scope: 'sum' | 'max' = 'sum',
    ): Promise<Map<string, number>> {
        const variantIds = productVariantIds.map(String);
        const totals = new Map<string, number>(variantIds.map(id => [id, 0]));
        if (variantIds.length === 0) return totals;

        const stockLocationIds = await this.resolveStockLocationIds(ctx, branchId);
        const byLocation = await this.getFreeByLocation(ctx, variantIds, stockLocationIds);
        for (const [variantId, locations] of byLocation) {
            const values = [...locations.values()];
            totals.set(
                variantId,
                scope === 'max'
                    ? Math.max(0, ...values)
                    : values.reduce((sum, free) => sum + free, 0),
            );
        }
        return totals;
    }

    // The single definition of a location's free quantity per variant (freeQuantity); every ATP,
    // reserve preview and order-line availability read goes through it.
    async getFreeByLocation(
        ctx: RequestContext,
        variantIds: string[],
        stockLocationIds: string[],
    ): Promise<Map<string, Map<string, number>>> {
        const result = new Map<string, Map<string, number>>();
        if (variantIds.length === 0 || stockLocationIds.length === 0) return result;
        const stockLevels = await this.connection.getRepository(ctx, StockLevel).find({
            where: {
                productVariantId: In(variantIds),
                stockLocationId: In(stockLocationIds),
            },
        });
        const reserved = await this.connection.getRepository(ctx, Reservation).find({
            where: {
                productVariantId: In(variantIds),
                stockLocationId: In(stockLocationIds),
                status: 'active' as const,
            },
        });
        const reservedByKey = new Map<string, number>();
        for (const row of reserved) {
            const key = `${row.productVariantId}:${row.stockLocationId}`;
            reservedByKey.set(key, (reservedByKey.get(key) ?? 0) + row.quantity);
        }
        for (const level of stockLevels) {
            const variantId = String(level.productVariantId);
            const locations = result.get(variantId) ?? new Map<string, number>();
            locations.set(
                String(level.stockLocationId),
                freeQuantity(
                    level.stockOnHand,
                    level.stockAllocated,
                    reservedByKey.get(`${variantId}:${level.stockLocationId}`) ?? 0,
                    level.customFields?.erpAvailableQuantity,
                ),
            );
            result.set(variantId, locations);
        }
        return result;
    }

    // What one order line can actually reserve: reservation takes a single location per line, so
    // this is the best location of the branch, not the sum the customer-facing tiers use.
    async getReservableBatch(
        ctx: RequestContext,
        productVariantIds: ID[],
        branchId: string | null,
    ): Promise<Map<string, number>> {
        return this.getAvailableToPromiseBatch(ctx, productVariantIds, branchId, 'max');
    }

    // includedInBranchAtp is the curated flag (#66); isActive is unreliable and deliberately unused.
    // Strict: no default-location fallback — empty means the branch has no stock scope.
    async findBranchStockLocationIds(ctx: RequestContext, branchId: string): Promise<string[]> {
        const warehouses = (await this.warehouseService.findAll(ctx)).filter(
            w => w.branchId === branchId && w.includedInBranchAtp,
        );
        if (warehouses.length === 0) return [];
        const warehouseErpIds = new Set(warehouses.map(w => w.erpId));
        const allLocations = await this.connection.getRepository(ctx, StockLocation).find();
        return allLocations
            .filter(l => warehouseErpIds.has(l.customFields?.warehouseErpId ?? ''))
            .map(l => String(l.id))
            .sort((a, b) => Number(a) - Number(b));
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

    // Without a branch (or a resolvable Warehouse) the single default StockLocation is used.
    private async resolveStockLocationIds(
        ctx: RequestContext,
        branchId?: string | null,
    ): Promise<string[]> {
        if (!branchId) {
            return [await this.getDefaultStockLocationId(ctx)];
        }
        const ids = await this.findBranchStockLocationIds(ctx, branchId);
        return ids.length > 0 ? ids : [await this.getDefaultStockLocationId(ctx)];
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
