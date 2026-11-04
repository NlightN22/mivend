import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import DataLoader from 'dataloader';
import { Ctx, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

@Resolver('SearchResult')
export class SearchResultAvailabilityResolver {
    private loaders = new WeakMap<RequestContext, DataLoader<string, boolean>>();

    constructor(private connection: TransactionalConnection) {}

    @ResolveField()
    availableForOrder(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<boolean> {
        let loader = this.loaders.get(ctx);
        if (!loader) {
            loader = new DataLoader(ids => this.load(ctx, ids));
            this.loaders.set(ctx, loader);
        }
        return loader.load(String(result.productVariantId));
    }

    private async load(ctx: RequestContext, ids: readonly string[]): Promise<boolean[]> {
        const numericIds = ids.filter(id => /^\d+$/.test(id)).map(Number);
        const rows =
            numericIds.length === 0
                ? []
                : await ctxQuery<Array<{ id: number }>>(
                      this.connection,
                      ctx,
                      `SELECT id FROM product_variant WHERE id = ANY($1::int[]) AND "customFieldsOrganizationid" IS NOT NULL`,
                      [numericIds],
                  );
        const available = new Set(rows.map(row => String(row.id)));
        return ids.map(id => available.has(id));
    }
}
