import { Injectable } from '@nestjs/common';
import { ProductService, RequestContext, StockLevel, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { WarehouseService } from '@mivend/plugin-access-control';
import { DocumentsService } from '@mivend/plugin-documents';

// Streams without a type here are listed with a reason in reconciled-streams.ts.
// StockLevel exists for every variant, so stock counts rows carrying a received-event marker.
export const COMPARED_AGGREGATE_TYPES = [
    'category',
    'organization',
    'warehouse',
    'priceType',
    'product',
    'price',
    'stock',
    'unit',
    'department',
    'stockOrganization',
    'user',
    'contract',
    'pointOfSale',
] as const;
export type ComparedAggregateType = (typeof COMPARED_AGGREGATE_TYPES)[number];

@Injectable()
export class ReconciliationLocalCountsService {
    constructor(
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
                return this.countPricesOfKnownProducts(ctx);
            case 'stock':
                return this.countReceivedStockLevels(ctx);
            case 'unit':
                return this.countRows(ctx, 'unit_record', '"isDeleted" = false');
            case 'department':
                return this.countRows(ctx, 'department', '"isActive" = true');
            case 'stockOrganization':
                return this.countRows(ctx, 'stock_organization', '"isActive" = true');
            case 'user':
                return this.countRows(ctx, 'erp_user', 'active = true');
            case 'contract':
                return this.countRows(ctx, 'contract', '"isActive" = true');
            case 'pointOfSale':
                return this.countActiveTradingPoints(ctx);
        }
    }

    // A named point without an address is never stored, yet upstream counts it; add those by latest event.
    private async countActiveTradingPoints(ctx: RequestContext): Promise<number> {
        const [row] = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT (SELECT count(*) FROM trading_point WHERE "isActive" = true)
                  + (SELECT count(*) FROM (
                       SELECT DISTINCT ON (entity_id) entity_id, payload
                       FROM integration_inbox_event
                       WHERE stream = 'point-of-sale' AND status = 'processed' AND payload <> '{}'::jsonb
                       ORDER BY entity_id, id DESC) latest
                     WHERE latest.payload->>'isActive' = 'true'
                       AND coalesce(latest.payload->>'isDeleted', 'false') <> 'true'
                       AND btrim(coalesce(latest.payload->>'name', '')) <> ''
                       AND btrim(coalesce(latest.payload->>'address', '')) = ''
                       AND NOT EXISTS (SELECT 1 FROM trading_point t WHERE t."erpId" = latest.entity_id)
                       AND EXISTS (SELECT 1 FROM counterparty c WHERE c."erpId" = latest.payload->>'counterpartyId')
                    ))::int AS n`,
        );
        return row.n;
    }

    // Table and condition are constants from the switch above, never user input.
    private async countRows(
        ctx: RequestContext,
        table: string,
        condition: string,
    ): Promise<number> {
        const [row] = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT count(*)::int AS n FROM ${table} WHERE ${condition}`,
        );
        return row.n;
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

    // Upstream counts every non-deleted category; a manager-made private override must not hide one.
    private async countCategories(ctx: RequestContext): Promise<number> {
        const [row] = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT count(*)::int AS n FROM collection
             WHERE "isRoot" = false AND "customFieldsFeedhidden" = false`,
        );
        return row.n;
    }

    // Prices may arrive before their product; upstream counts only prices of products it holds.
    private async countPricesOfKnownProducts(ctx: RequestContext): Promise<number> {
        const [row] = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT count(*)::int AS n FROM product_variant_price_entry e
             WHERE EXISTS (SELECT 1 FROM product p
                           WHERE p."customFieldsExternalid" = e."productExternalId" AND p."deletedAt" IS NULL)`,
        );
        return row.n;
    }

    // Upstream counts folder nodes as warehouses; mivend skips them, so add the skipped active ones.
    private async countActiveWarehouses(ctx: RequestContext): Promise<number> {
        const all = await this.warehouseService.findAll(ctx);
        const [row] = await ctxQuery<Array<{ n: number }>>(
            this.connection,
            ctx,
            `SELECT count(*)::int AS n FROM (
                 SELECT DISTINCT ON (entity_id) payload FROM integration_inbox_event
                 WHERE stream = 'warehouse' AND status = 'processed'
                 ORDER BY entity_id, version DESC, id DESC
             ) latest
             WHERE latest.payload->>'isFolder' = 'true' AND latest.payload->>'isActive' = 'true'
               AND coalesce(latest.payload->>'isDeleted', 'false') <> 'true'`,
        );
        return all.filter(w => w.isActive).length + row.n;
    }

    private async countActiveOrganizations(ctx: RequestContext): Promise<number> {
        const all = await this.documentsService.findAllRequisites(ctx);
        return all.filter(o => o.isActive).length;
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
