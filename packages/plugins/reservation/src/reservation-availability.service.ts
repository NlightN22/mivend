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

    // ATP = stockOnHand - stockAllocated - activeReservations, capped per-location at the ERP's own
    // availableQuantity where known (issue #72's revised formula) — ERP is the sole source of
    // truth for reservations, since it receives holds from other channels that never reach
    // mivend as events at all, so its own number is the only defense against those.
    //
    // A local Reservation is subtracted for as long as it stays `status: 'active'` — REGARDLESS
    // of erpConfirmedAt. An earlier revision of this method stopped subtracting a reservation
    // once ERP confirmed it, reasoning that the ERP's own availableQuantity would already reflect the
    // hold by then and double-subtracting would understate ATP. That reasoning solved a minor,
    // harmless problem (a slightly-too-conservative number) by creating a real one: if the ERP's own
    // StockChanged confirming the hold was itself delayed or dropped, NEITHER number reflected
    // the held unit for that whole window — a genuine oversell risk (mivend.audit.72 HIGH).
    // Reverted per the same reasoning that makes the cap below safe in the first place: min() by
    // definition never double-subtracts, it only ever picks the more conservative of the two
    // numbers — so there was never anything to protect against. Keeping the local subtraction
    // permanent for the reservation's whole active lifetime closes that window entirely: the
    // held unit is accounted for locally from the moment it's created until it's actually
    // released (today: only a real CANCELLED does that — see ReservationErpSyncService, which
    // deliberately does NOT release on RESERVED/CONFIRMED/SHIPPED/DELIVERED either, for the same
    // "don't trust an unverified status" reasoning), with the ERP's own number only ever tightening
    // the cap further (for holds from OTHER channels mivend has no reservation row for at all),
    // never being the sole thing standing between "held" and "shown as free".
    //
    // The cap is applied PER StockLocation, not after summing across locations — the ERP's
    // availableQuantity is itself location-scoped (StockChanged is per warehouse), so capping
    // after summing would mix numbers from different scopes. No cap is applied for a location ERP
    // has never reported a StockChanged for (erpAvailableQuantity still null) — falls back to the
    // local-only number for that location, same bootstrap behavior as every other ERP-sourced
    // field in this codebase.
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
            const free = freeQuantity(
                level.stockOnHand,
                level.stockAllocated,
                reservedByKey.get(`${variantId}:${level.stockLocationId}`) ?? 0,
                level.customFields?.erpAvailableQuantity,
            );
            totals.set(
                variantId,
                scope === 'max'
                    ? Math.max(totals.get(variantId) ?? 0, free)
                    : (totals.get(variantId) ?? 0) + free,
            );
        }
        return totals;
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
