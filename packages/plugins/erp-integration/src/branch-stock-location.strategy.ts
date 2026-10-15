import { Logger } from '@nestjs/common';
import {
    AvailableStock,
    BaseStockLocationStrategy,
    Injector,
    LocationWithQuantity,
    OrderLine,
    RequestContext,
    StockLevel,
    StockLocation,
} from '@vendure/core';
import { ID } from '@vendure/common/lib/shared-types';
import { freeQuantity, ReservationAvailabilityService } from '@mivend/plugin-reservation';

const loggerCtx = 'BranchStockLocationStrategy';

// Branch is a soft grouping, not a Channel partition: MultiChannelStockLocationStrategy doesn't fit.
// Uses order.customFields.branchId, resolved once at order time; stable if the trading point changes.
export class BranchStockLocationStrategy extends BaseStockLocationStrategy {
    private availabilityService!: ReservationAvailabilityService;

    init(injector: Injector): void {
        super.init(injector);
        this.availabilityService = injector.get(ReservationAvailabilityService);
    }

    getAvailableStock(
        _ctx: RequestContext,
        _productVariantId: ID,
        stockLevels: StockLevel[],
    ): AvailableStock {
        // Same per-location formula as ATP; local reservations are not visible to this sync hook.
        let free = 0;
        for (const stockLevel of stockLevels) {
            free += freeQuantity(
                stockLevel.stockOnHand,
                stockLevel.stockAllocated,
                0,
                stockLevel.customFields?.erpAvailableQuantity,
            );
        }
        return { stockOnHand: free, stockAllocated: 0 };
    }

    async forAllocation(
        ctx: RequestContext,
        stockLocations: StockLocation[],
        orderLine: OrderLine,
        quantity: number,
    ): Promise<LocationWithQuantity[]> {
        // Upstream ReservationService already rejects incomplete orders, so reaching here means a real bug.
        // Never fall back to a non-branch-scoped StockLocation; throw instead.
        if (stockLocations.length === 0) {
            const message = `orderLine ${orderLine.id}: cannot allocate stock, no StockLocation exists at all`;
            Logger.error(message, loggerCtx);
            throw new Error(message);
        }

        const branchLocations = await this.getBranchStockLocations(ctx, orderLine, stockLocations);
        if (branchLocations.length === 0) {
            const branchId = await this.getOrderBranchId(ctx, orderLine);
            const message = `orderLine ${orderLine.id}: no branch-scoped StockLocation resolved for branchId=${branchId ?? 'null'}`;
            Logger.error(message, loggerCtx);
            throw new Error(message);
        }

        const best = await this.pickLocationWithMostAvailableStock(
            ctx,
            branchLocations,
            orderLine.productVariantId,
        );
        return [{ location: best, quantity }];
    }

    private async getBranchStockLocations(
        ctx: RequestContext,
        orderLine: OrderLine,
        stockLocations: StockLocation[],
    ): Promise<StockLocation[]> {
        const branchId = await this.getOrderBranchId(ctx, orderLine);
        if (!branchId) return [];

        const branchLocationIds = new Set(
            await this.availabilityService.findBranchStockLocationIds(ctx, branchId),
        );
        if (branchLocationIds.size === 0) return [];

        return stockLocations.filter(location => branchLocationIds.has(String(location.id)));
    }

    private async getOrderBranchId(
        ctx: RequestContext,
        orderLine: OrderLine,
    ): Promise<string | null> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('o."customFieldsBranchid"', 'branchId')
            .from('order_line', 'ol')
            .innerJoin('order', 'o', 'o.id = ol."orderId"')
            .where('ol.id = :id', { id: orderLine.id })
            .getRawOne<{ branchId: string | null }>();
        return row?.branchId ?? null;
    }

    private async pickLocationWithMostAvailableStock(
        ctx: RequestContext,
        locations: StockLocation[],
        productVariantId: ID,
    ): Promise<StockLocation> {
        let best = locations[0];
        let bestAvailable = -Infinity;
        for (const location of locations) {
            const stockLevel = await this.connection
                .getRepository(ctx, StockLevel)
                .findOne({ where: { productVariantId, stockLocationId: location.id } });
            const available = freeQuantity(
                stockLevel?.stockOnHand ?? 0,
                stockLevel?.stockAllocated ?? 0,
                0,
                stockLevel?.customFields?.erpAvailableQuantity,
            );
            if (available > bestAvailable) {
                bestAvailable = available;
                best = location;
            }
        }
        return best;
    }
}
