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
import { WarehouseService } from '@mivend/plugin-access-control';

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
    private warehouseService!: WarehouseService;

    init(injector: Injector): void {
        super.init(injector);
        this.warehouseService = injector.get(WarehouseService);
    }

    getAvailableStock(
        _ctx: RequestContext,
        _productVariantId: ID,
        stockLevels: StockLevel[],
    ): AvailableStock {
        let stockOnHand = 0;
        let stockAllocated = 0;
        for (const stockLevel of stockLevels) {
            stockOnHand += stockLevel.stockOnHand;
            stockAllocated += stockLevel.stockAllocated;
        }
        return { stockOnHand, stockAllocated };
    }

    async forAllocation(
        ctx: RequestContext,
        stockLocations: StockLocation[],
        orderLine: OrderLine,
        quantity: number,
    ): Promise<LocationWithQuantity[]> {
        const branchLocations = await this.getBranchStockLocations(ctx, orderLine, stockLocations);
        if (branchLocations.length === 0) {
            Logger.warn(
                `orderLine ${orderLine.id}: no branch-scoped StockLocation resolved, falling back to first available location`,
                loggerCtx,
            );
            return stockLocations.length > 0 ? [{ location: stockLocations[0], quantity }] : [];
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

        const warehouses = (await this.warehouseService.findAll(ctx)).filter(
            w => w.branchId === branchId && w.isActive,
        );
        const warehouseErpIds = new Set(warehouses.map(w => w.erpId));
        if (warehouseErpIds.size === 0) return [];

        return stockLocations.filter(location =>
            warehouseErpIds.has(location.customFields?.warehouseErpId ?? ''),
        );
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
            const available = (stockLevel?.stockOnHand ?? 0) - (stockLevel?.stockAllocated ?? 0);
            if (available > bestAvailable) {
                bestAvailable = available;
                best = location;
            }
        }
        return best;
    }
}
