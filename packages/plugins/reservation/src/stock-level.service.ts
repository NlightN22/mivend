import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import DataLoader from 'dataloader';
import { CustomerService, GlobalSettingsService, RequestContext } from '@vendure/core';
import { BranchSettingsService, WarehouseService } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { ReservationAvailabilityService } from './reservation-availability.service';
import {
    DEFAULT_STOCK_TIER_LOW_MAX,
    DEFAULT_STOCK_TIER_MEDIUM_MAX,
    StockTier,
    stockTierFor,
} from './stock-tier';

// Customer-facing stock tiers for the viewer's own branch (docs/order-flow.md, "Customer-facing
// stock tiers"): never a total across branches, never exact numbers.
@Injectable()
export class StockLevelService {
    private loaders = new WeakMap<RequestContext, DataLoader<string, StockTier>>();

    constructor(
        private availabilityService: ReservationAvailabilityService,
        private branchSettingsService: BranchSettingsService,
        private warehouseService: WarehouseService,
        private globalSettingsService: GlobalSettingsService,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
    ) {}

    // Batches the per-item field resolvers of one request into a single ATP query.
    getTier(ctx: RequestContext, variantId: ID): Promise<StockTier> {
        let loader = this.loaders.get(ctx);
        if (!loader) {
            loader = new DataLoader(async ids => {
                const tiers = await this.getTiers(ctx, [...ids]);
                return ids.map(id => tiers.get(id) ?? 'OUT_OF_STOCK');
            });
            this.loaders.set(ctx, loader);
        }
        return loader.load(String(variantId));
    }

    async getTiers(ctx: RequestContext, variantIds: ID[]): Promise<Map<string, StockTier>> {
        const branchId = await this.getViewerBranchId(ctx);
        const [atp, settings] = await Promise.all([
            this.availabilityService.getAvailableToPromiseBatch(ctx, variantIds, branchId),
            this.globalSettingsService.getSettings(ctx),
        ]);
        const thresholds = {
            lowMax: settings.customFields?.stockTierLowMax ?? DEFAULT_STOCK_TIER_LOW_MAX,
            mediumMax: settings.customFields?.stockTierMediumMax ?? DEFAULT_STOCK_TIER_MEDIUM_MAX,
        };
        return new Map([...atp].map(([id, qty]) => [id, stockTierFor(qty, thresholds)]));
    }

    async getViewerWarehouseErpIds(ctx: RequestContext): Promise<string[]> {
        const branchId = await this.getViewerBranchId(ctx);
        if (!branchId) return [];
        const warehouses = await this.warehouseService.findAll(ctx);
        return warehouses
            .filter(w => w.branchId === branchId && w.includedInBranchAtp)
            .map(w => w.erpId);
    }

    // A logged-in customer's counterparty branch, else the global default branch (guests too).
    private async getViewerBranchId(ctx: RequestContext): Promise<string | null> {
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            const counterparty = customer
                ? await this.counterpartyService.getForCustomer(ctx, String(customer.id))
                : null;
            if (counterparty?.branchId) return counterparty.branchId;
        }
        return this.branchSettingsService.getGlobalDefaultBranchId(ctx);
    }
}
