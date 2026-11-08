import {
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

export const MAX_LINE_QUANTITY = 1_000_000;

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

type WithOrganization = { customFields?: { organizationId?: number | string | null } | null };

// The seller organization a placed line carries; organizationOrderGuard stamps the same value at checkout.
export function sellerOrganizationOf(variant: ProductVariant): number | string | null {
    return (variant as WithOrganization).customFields?.organizationId ?? null;
}

export function noOrganizationMessage(sku: string): string {
    return `${sku.trim()} has no seller organization and cannot be added`;
}
