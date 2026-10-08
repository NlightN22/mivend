import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { TransactionalConnection } from '@vendure/core';

@Resolver('SearchResult')
export class SearchResultAvailabilityResolver {
    constructor(private connection: TransactionalConnection) {}

    @ResolveField()
    async availableForOrder(@Parent() result: { productVariantId: string }): Promise<boolean> {
        const rows: unknown[] = await this.connection.rawConnection.query(
            `SELECT 1 FROM product_variant WHERE id = $1 AND "customFieldsOrganizationid" IS NOT NULL`,
            [result.productVariantId],
        );
        return rows.length > 0;
    }
}
