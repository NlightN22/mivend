import { Order, ProductVariant, RequestContext, TransactionalConnection } from '@vendure/core';

// Issue #107: split out of PriceResolutionService (which was already over AGENTS.md's 200-300
// line limit) — this is a self-contained lookup (1C product erpId + per-order quantities by
// erpId) that PromoDiscountRuleService.getBestPromoPercent needs, unrelated to that file's own
// facet/weight/amount aggregation logic.

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

// Sums order-line quantities per product erpId — a promo rule's triggerQuantity is checked
// against the whole order, not the single line being priced (buy N of product A anywhere in the
// cart, get product B's line discounted). Mirrors PriceResolutionService.buildAggregates' own
// "this line's final post-change quantity, plus every other existing line" shape.
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
