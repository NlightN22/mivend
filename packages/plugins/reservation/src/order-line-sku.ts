import {
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

// Vendure does not keep a SKU unique, so an ambiguous article is refused rather than guessed.
export async function findVariantBySku(
    connection: TransactionalConnection,
    ctx: RequestContext,
    sku: string,
): Promise<ProductVariant> {
    const wanted = sku.trim();
    if (!wanted) throw new UserInputError('Enter an article');
    const variants = await connection
        .getRepository(ctx, ProductVariant)
        .createQueryBuilder('v')
        .where('v.sku = :sku', { sku: wanted })
        .andWhere('v.deletedAt IS NULL')
        .andWhere('v.enabled = true')
        .limit(2)
        .getMany();
    if (variants.length === 0) throw new UserInputError(`No product with the article ${wanted}`);
    if (variants.length > 1) {
        throw new UserInputError(`The article ${wanted} matches more than one product`);
    }
    return variants[0];
}

export function noPriceMessage(sku: string): string {
    return `${sku.trim()} has no price for this customer and cannot be added`;
}
