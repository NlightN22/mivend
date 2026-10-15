import { Order, ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';

// Separate from PriceResolutionService to respect AGENTS.md file size limits;
// the erpId lookup is unrelated to its facet/weight/amount aggregation.

export async function getProductErpId(
    connection: TransactionalConnection,
    ctx: RequestContext,
    variantId: string,
): Promise<string> {
    const variant = await connection.getRepository(ctx, ProductVariant).findOne({
        where: { id: variantId },
        relations: ['product'],
    });
    return variant?.product?.customFields?.externalId ?? '';
}

// triggerQuantity counts across the whole order, not just the line being priced:
// the quantity of this line after the change, plus all other lines for the same erpId.
export async function buildProductErpQuantities(
    connection: TransactionalConnection,
    ctx: RequestContext,
    variantId: string,
    order: Order,
    quantity: number,
): Promise<Map<string, number>> {
    const quantities = new Map<string, number>();
    const thisErpId = await getProductErpId(connection, ctx, variantId);
    if (thisErpId) {
        quantities.set(thisErpId, (quantities.get(thisErpId) ?? 0) + quantity);
    }
    for (const line of order.lines) {
        const lineVariantId = String(line.productVariantId);
        if (lineVariantId === variantId) continue;
        const erpId = await getProductErpId(connection, ctx, lineVariantId);
        if (!erpId) continue;
        quantities.set(erpId, (quantities.get(erpId) ?? 0) + line.quantity);
    }
    return quantities;
}
