import { Injectable } from '@nestjs/common';
import { CollectionService, ProductService, RequestContext } from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { WarehouseService } from '@mivend/plugin-access-control';
import { DocumentsService } from '@mivend/plugin-documents';

// Which of the 11 aggregateType values the summary endpoint supports actually have a meaningful,
// countable local equivalent — decided per issue #84's "Comparison scope", confirmed by reading
// the actual inbound stream wiring rather than assumed from the issue text:
//
// - 'offer' / 'stockOrganization': IntegrationInboxProcessorService registers both as
//   DeferredStreamHandler (see integration-inbox-processor.service.ts) — recorded, logged no-ops,
//   no local entity is ever created/updated from either stream. No local count exists to compare.
// - 'unit': no InboundStream member for it at all (types.ts's InboundStream union has no 'unit'
//   entry) — mivend never receives or stores unit-of-measure data as its own countable entity.
// - 'storageLocation': StorageLocationStreamHandler's own doc comment states no per-location
//   table is kept locally — every row folds into ProductVariant.customFields.organizationId
//   (last-priority-wins), so there is no local "storage location count" to compare against
//   Integration Service's count at all, independent of the activeCount-is-null special case.
//
// The remaining 7 do have a real, already-owned local entity with an isActive/enabled concept:
// category (Collection, one per category minus the root), organization (OrganizationRequisites),
// warehouse (Warehouse), priceType (PriceType), product (Product), price (CustomerPriceType
// disabled — see note below), stock (StockLevel). Of these, 'price' and 'stock' are per-
// (product, priceType)/(product, warehouse) facts with no single existing count-yielding service
// method and a materially larger aggregation design (which local rows count as "the same fact"
// upstream counts) — deferred rather than bolted on hastily, same as this project's own
// known-technical-debt entries in docs/testing-strategy.md. Only the 5 types below are wired up.
export const COMPARED_AGGREGATE_TYPES = [
    'category',
    'organization',
    'warehouse',
    'priceType',
    'product',
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
        }
    }

    private async countCategories(ctx: RequestContext): Promise<number> {
        // CategoryStreamHandler creates one Collection per category; CollectionService.findAll's
        // own result always includes the root Collection Vendure creates at bootstrap, which is
        // not itself a category — subtract it.
        const { totalItems } = await this.collectionService.findAll(ctx, { take: 1 });
        return Math.max(0, totalItems - 1);
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
