import { Injectable } from '@nestjs/common';
import {
    CollectionService,
    ProductService,
    RequestContext,
    StockLevel,
    TransactionalConnection,
} from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { WarehouseService } from '@mivend/plugin-access-control';
import { DocumentsService } from '@mivend/plugin-documents';
import { ProductVariantPriceEntry } from '@mivend/plugin-price-entry';

// offer, stockOrganization, unit, storageLocation have no local entity to count; excluded.
// price/stock are plain row counts; StockLevel exists for every variant, not per received fact.
export const COMPARED_AGGREGATE_TYPES = [
    'category',
    'organization',
    'warehouse',
    'priceType',
    'product',
    'price',
    'stock',
] as const;
export type ComparedAggregateType = (typeof COMPARED_AGGREGATE_TYPES)[number];

@Injectable()
export class ReconciliationLocalCountsService {
    constructor(
        private readonly collectionService: CollectionService,
        private readonly productService: ProductService,
        private readonly customerPricingService: CustomerPricingService,
        private readonly warehouseService: WarehouseService,
        private readonly documentsService: DocumentsService,
        private readonly connection: TransactionalConnection,
    ) {}

    async getLocalActiveCount(
        ctx: RequestContext,
        aggregateType: ComparedAggregateType,
    ): Promise<number> {
        switch (aggregateType) {
            case 'category':
                return this.countCategories(ctx);
            case 'organization':
                return this.countActiveOrganizations(ctx);
            case 'warehouse':
                return this.countActiveWarehouses(ctx);
            case 'priceType':
                return this.countActivePriceTypes(ctx);
            case 'product':
                return this.countActiveProducts(ctx);
            case 'price':
                return this.connection.getRepository(ctx, ProductVariantPriceEntry).count();
            case 'stock':
                return this.countReceivedStockLevels(ctx);
        }
    }

    // Plain StockLevel count is wrong: Vendure auto-creates zero-quantity rows per variant/location.
    // Use customFields.erpAvailableQuantity as the marker of a really received stock event.
    private async countReceivedStockLevels(ctx: RequestContext): Promise<number> {
        return this.connection
            .getRepository(ctx, StockLevel)
            .createQueryBuilder('stockLevel')
            .where('"stockLevel"."customFieldsErpavailablequantity" IS NOT NULL')
            .getCount();
    }

    private async countCategories(ctx: RequestContext): Promise<number> {
        // isPrivate:false drops deactivated categories and the root; do not subtract 1 for root.
        // The root's isPrivate defaults to true here, so the filter alone excludes it.
        const { totalItems } = await this.collectionService.findAll(ctx, {
            take: 1,
            filter: { isPrivate: { eq: false } },
        });
        return totalItems;
    }

    private async countActiveOrganizations(ctx: RequestContext): Promise<number> {
        const all = await this.documentsService.findAllRequisites(ctx);
        return all.filter(o => o.isActive).length;
    }

    private async countActiveWarehouses(ctx: RequestContext): Promise<number> {
        const all = await this.warehouseService.findAll(ctx);
        return all.filter(w => w.isActive).length;
    }

    private async countActivePriceTypes(ctx: RequestContext): Promise<number> {
        const all = await this.customerPricingService.findAllPriceTypes(ctx);
        return all.filter(p => p.isActive).length;
    }

    private async countActiveProducts(ctx: RequestContext): Promise<number> {
        const { totalItems } = await this.productService.findAll(ctx, {
            take: 1,
            filter: { enabled: { eq: true } },
        });
        return totalItems;
    }
}
