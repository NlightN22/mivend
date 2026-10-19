import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

@Resolver('SearchResult')
export class SearchResultAvailabilityResolver {
    constructor(private connection: TransactionalConnection) {}

    @ResolveField()
    async availableForOrder(
        @Ctx() ctx: RequestContext,
        @Parent() result: { productVariantId: string },
    ): Promise<boolean> {
        const rows = await ctxQuery<unknown[]>(
            this.connection,
            ctx,
            `SELECT 1 FROM product_variant WHERE id = $1 AND "customFieldsOrganizationid" IS NOT NULL`,
            [result.productVariantId],
        );
        return rows.length > 0;
    }
}
