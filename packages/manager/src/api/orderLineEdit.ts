import { adminApi } from './client';
import {
    AddOrderLineBySkuDocument,
    ChangeOrderLineQuantityDocument,
    OrderLineAvailabilityDocument,
    OrderLineIdsBySkuDocument,
    OrderLineQuoteDocument,
    OrderLineShortfallsDocument,
    ProductVariantsBySkuDocument,
    RemoveOrderLineDocument,
    SplitOrderLinesByStockDocument,
    type OrderLineAvailabilityFieldsFragment,
    type OrderLineQuoteQuery,
    type OrderLineShortfallsQuery,
    type SplitOrderLinesByStockMutation,
} from './generated/graphql';

export type OrderLineAvailability = OrderLineAvailabilityFieldsFragment;
export type OrderLineShortfallRow = OrderLineShortfallsQuery['orderLineShortfalls'][number];
export type OrderLineQuote = OrderLineQuoteQuery['orderLineQuote'];
export type SplitOutcome = SplitOrderLinesByStockMutation['splitOrderLinesByStock'][number];

export async function fetchOrderLineAvailability(
    orderId: string,
): Promise<OrderLineAvailability[]> {
    return (await adminApi(OrderLineAvailabilityDocument, { orderId })).orderLineAvailability;
}

export async function changeOrderLineQuantity(
    orderId: string,
    orderLineId: string,
    quantity: number,
): Promise<void> {
    await adminApi(ChangeOrderLineQuantityDocument, { orderId, orderLineId, quantity });
}

export async function removeOrderLine(orderId: string, orderLineId: string): Promise<void> {
    await adminApi(RemoveOrderLineDocument, { orderId, orderLineId });
}

export async function splitOrderLinesByStock(orderId: string): Promise<SplitOutcome[]> {
    return (await adminApi(SplitOrderLinesByStockDocument, { orderId })).splitOrderLinesByStock;
}

export async function fetchOrderLineShortfalls(orderId: string): Promise<OrderLineShortfallRow[]> {
    return (await adminApi(OrderLineShortfallsDocument, { orderId })).orderLineShortfalls;
}

export interface SkuMatch {
    id: string;
    sku: string;
    name: string;
}

export async function addOrderLineBySku(
    orderId: string,
    sku: string,
    quantity: number,
): Promise<void> {
    await adminApi(AddOrderLineBySkuDocument, { orderId, sku, quantity });
}

export async function searchVariants(term: string): Promise<SkuMatch[]> {
    return (await adminApi(ProductVariantsBySkuDocument, { term })).productVariants.items;
}

export interface AddedLine {
    id: string;
    listPriceMinor: number;
    effectivePriceMinor: number;
}

export async function findOrderLineBySku(orderId: string, sku: string): Promise<AddedLine | null> {
    const lines = (await adminApi(OrderLineIdsBySkuDocument, { orderId })).visibleOrders.items[0]
        ?.lines;
    // Lines of one article can coexist; the one just added has the highest id.
    const line = lines
        ?.filter(l => l.productVariant.sku === sku)
        .sort((a, b) => Number(b.id) - Number(a.id))[0];
    return line
        ? {
              id: line.id,
              listPriceMinor: line.unitPriceWithTax,
              effectivePriceMinor: line.discountedUnitPriceWithTax,
          }
        : null;
}

export async function fetchOrderLineQuote(
    orderId: string,
    sku: string,
    quantity: number,
): Promise<OrderLineQuote> {
    return (await adminApi(OrderLineQuoteDocument, { orderId, sku, quantity })).orderLineQuote;
}
