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

// Which of the 11 aggregateType values the summary endpoint supports have a meaningful,
// countable local equivalent — decided per issue #84's "Comparison scope" and revisited per the
// user's request that reconciliation cover "everything mivend actually loads and uses," even in
// simplified form. Confirmed by reading the actual inbound stream wiring rather than assumed:
//
// - 'offer' / 'stockOrganization': IntegrationInboxProcessorService registers both as
//   DeferredStreamHandler (see integration-inbox-processor.service.ts) — recorded, logged no-ops,
//   no local entity is EVER created/updated from either stream. There is genuinely nothing to
//   count locally — "simplify the comparison" can't manufacture an entity that doesn't exist.
//   Making these comparable is a real feature (build real handling for these two streams first),
//   not a reconciliation tweak — track separately if/when that's prioritized.
// - 'unit': no InboundStream member for it at all (types.ts's InboundStream union has no 'unit'
//   entry) — mivend never receives or stores unit-of-measure data as its own countable entity.
//   Same as above: nothing exists yet to count.
// - 'storageLocation': StorageLocationStreamHandler's own doc comment states no per-location
//   table is kept locally — every row folds into ProductVariant.customFields.organizationId
//   (last-priority-wins), so there is no local "storage location count" to compare against
//   Integration Service's count at all, independent of the activeCount-is-null special case.
//
// The remaining 7 (of the 11 Integration Service supports today) DO have a real, already-owned
// local entity to count — including 'price'/'stock', simplified per the user's request rather
// than deferred: a plain row count, not the fuller "which local rows count as the same fact
// upstream counts" aggregation design originally sketched (that fuller design stays a possible
// future refinement, not a blocker for a first, useful signal now):
// - category → Collection (one per category minus the root)
// - organization → OrganizationRequisites
// - warehouse → Warehouse
// - priceType → PriceType
// - product → Product
// - price → ProductVariantPriceEntry (a plain row count — this doesn't yet reconcile "the same
//   (product, priceType) fact", just how many price rows mivend holds vs Integration Service's
//   own price record count; still a real, useful signal for a gross mismatch)
// - stock → StockLevel (same simplification: total row count, not netted against zero-quantity
//   rows or matched per (product, warehouse) pair)
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

    // A plain StockLevel row count (the original simplified metric) is structurally wrong, not
    // just approximate: Vendure auto-creates a zero-quantity StockLevel for every
    // (ProductVariant, StockLocation) pair at variant-creation time, regardless of whether a real
    // `stock` Kafka event was ever received for it — so that count mostly measures "how many
    // variants exist," not "how many stock facts we hold" (confirmed live: local count stayed
    // ~51834, matching product count almost exactly, while only 1305 stock events had ever been
    // received). `customFields.erpAvailableQuantity` (StockStreamHandler's own idempotency/data
    // marker, set only when a real event was applied) is the source-agnostic signal for "we
    // actually have a received stock fact here" — works regardless of whether the source stays
    // Kafka or changes later, unlike counting inbox events directly.
    private async countReceivedStockLevels(ctx: RequestContext): Promise<number> {
        return this.connection
            .getRepository(ctx, StockLevel)
            .createQueryBuilder('stockLevel')
            .where('stockLevel."customFieldsErpavailablequantity" IS NOT NULL')
            .getCount();
    }

    private async countCategories(ctx: RequestContext): Promise<number> {
        // CategoryStreamHandler creates one Collection per category; CollectionService.findAll's
        // own result always includes the root Collection Vendure creates at bootstrap, which is
        // not itself a category — subtract it. isPrivate:false filters out categories
        // CategoryStreamHandler has hidden on deactivation (issue #90) — without this filter a
        // deactivated category still counted as present, defeating #90's own reconciliation fix
        // (mivend.audit.85 HIGH finding).
        const { totalItems } = await this.collectionService.findAll(ctx, {
            take: 1,
            filter: { isPrivate: { eq: false } },
        });
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
