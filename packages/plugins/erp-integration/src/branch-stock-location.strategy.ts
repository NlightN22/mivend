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

// Confirmed architecture (issue #63): a "branch" is a soft staff/counterparty grouping tag, not
// a hard catalog/pricing partition, so Vendure's own MultiChannelStockLocationStrategy (which
// filters by active Channel) does not fit — one branch has multiple warehouses/StockLocations,
// with no Channel involved at all. This strategy instead resolves the order's own already-
// denormalized customFields.branchId (set once at OrderPlacedEvent time from the customer's
// TradingPoint.servicingBranchId — see ErpOrderService.onOrderPlaced) and restricts allocation to
// that branch's StockLocations (via Warehouse.branchId -> StockLocation.customFields
// .warehouseErpId). Never re-derives branch from TradingPoint itself — Order.customFields
// .branchId IS that resolution, already made once, and is what stays stable even if the trading
// point's servicing branch is edited later.
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
        // Fail loudly instead of guessing (issue #95). By the time native allocation runs, every
        // real order should already have passed ReservationService's ErpExportDataMissingError
        // gate (issue #85) — so an empty stockLocations, or a non-empty stockLocations with zero
        // branch-scoped matches, both mean something is actually broken (a manually-created
        // order, a data race, or a genuine bug elsewhere), not a normal case to paper over by
        // allocating onto an arbitrary, non-branch-scoped StockLocation.
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
