import { adminApi } from './client';
import {
    AddItemToDraftOrderDocument,
    AddManualPaymentToOrderDocument,
    AdjustDraftOrderLineQuantityDocument,
    CreateDraftOrderDocument,
    EligibleShippingMethodsForDraftOrderDocument,
    OrderCreateCounterpartiesDocument,
    OrderCreateCustomersDocument,
    OrderCreateOrderDocument,
    OrderCreateProductSearchDocument,
    RemoveDraftOrderLineDocument,
    RequestPriceAdjustmentDocument,
    SetCustomerForDraftOrderDocument,
    SetDraftOrderShippingAddressDocument,
    SetDraftOrderShippingMethodDocument,
    SetDraftOrderTradingPointDocument,
    TransitionOrderToStateDocument,
    type DraftOrderFieldsFragment,
} from './generated/graphql';

export interface CustomerOption {
    counterpartyId: string;
    customerId: string;
    shortName: string;
    legalName: string;
    inn: string | null;
    priceType: string;
    tradingPoints: { id: string; name: string; address: string }[];
}

export interface CustomerCredit {
    creditLimit: number;
    creditBalance: number;
}

// Bounded at 500 as a stopgap; the real fix is a search-as-you-type picker
// using counterparties(options:{search}) instead of fetching everything.
export async function fetchCustomerOptions(): Promise<CustomerOption[]> {
    const result = await adminApi(OrderCreateCounterpartiesDocument);
    // Batched lookup filtered to exactly the fetched counterparty ids, not a flat cap:
    // a flat cap silently dropped customers once the customer book passed 200 rows.
    const counterpartyIds = result.counterparties.items.map(c => c.id);
    // counterpartyId is a customField: filter it with StringOperators, not IDOperators,
    // even though it holds an id.
    const customersResult = await adminApi(OrderCreateCustomersDocument, {
        counterpartyIds,
        take: counterpartyIds.length,
    });
    const customerIdByCounterpartyId = new Map(
        customersResult.customers.items
            .filter(c => c.counterparty)
            .map(c => [c.counterparty?.id as string, c.id]),
    );

    return result.counterparties.items
        .filter(c => customerIdByCounterpartyId.has(c.id))
        .map(c => ({
            counterpartyId: c.id,
            customerId: customerIdByCounterpartyId.get(c.id) as string,
            shortName: c.shortName,
            legalName: c.legalName,
            inn: c.inn,
            priceType: c.priceType,
            // Same rule as the server: only active, visible points can be chosen for delivery.
            tradingPoints: c.tradingPoints
                .filter(p => p.isActive && p.customerStatus === 'active')
                .map(({ id, name, address }) => ({ id, name, address })),
        }));
}

// Kept separate: a ForbiddenError on a non-null field (creditLimit/creditBalance need
// ReadCounterpartyCredit) nulls the whole GraphQL response, so don't share a request.
export { fetchCreditForCounterparty as fetchCustomerCredit } from './customers';

export interface ProductSearchResult {
    productVariantId: string;
    productName: string;
    sku: string;
}

export async function searchProducts(term: string): Promise<ProductSearchResult[]> {
    if (!term.trim()) return [];
    const result = await adminApi(OrderCreateProductSearchDocument, { term });
    return result.search.items;
}

export type DraftOrderState = DraftOrderFieldsFragment;
export type DraftOrderLine = DraftOrderFieldsFragment['lines'][number];

function assertOrderResult<T extends { __typename: string }>(
    result: T,
): Extract<T, { __typename: 'Order' }> {
    if (result.__typename !== 'Order') {
        const message = 'message' in result ? (result as { message?: string }).message : undefined;
        throw new Error(message ?? 'Order mutation failed');
    }
    return result as Extract<T, { __typename: 'Order' }>;
}

export async function fetchOrder(orderId: string): Promise<DraftOrderState> {
    const result = await adminApi(OrderCreateOrderDocument, { id: orderId });
    if (!result.order) throw new Error('Order not found');
    return result.order;
}

export async function createDraftOrder(): Promise<DraftOrderState> {
    const result = await adminApi(CreateDraftOrderDocument);
    return result.createDraftOrder;
}

export async function setCustomerForDraftOrder(
    orderId: string,
    customerId: string,
): Promise<DraftOrderState> {
    const result = await adminApi(SetCustomerForDraftOrderDocument, { orderId, customerId });
    return assertOrderResult(result.setCustomerForDraftOrder);
}

export async function addItemToDraftOrder(
    orderId: string,
    productVariantId: string,
    quantity: number,
): Promise<DraftOrderState> {
    const result = await adminApi(AddItemToDraftOrderDocument, {
        orderId,
        input: { productVariantId, quantity },
    });
    return assertOrderResult(result.addItemToDraftOrder);
}

export async function adjustDraftOrderLineQuantity(
    orderId: string,
    orderLineId: string,
    quantity: number,
): Promise<DraftOrderState> {
    const result = await adminApi(AdjustDraftOrderLineQuantityDocument, {
        orderId,
        input: { orderLineId, quantity },
    });
    return assertOrderResult(result.adjustDraftOrderLine);
}

export async function removeDraftOrderLine(
    orderId: string,
    orderLineId: string,
): Promise<DraftOrderState> {
    const result = await adminApi(RemoveDraftOrderLineDocument, { orderId, orderLineId });
    return assertOrderResult(result.removeDraftOrderLine);
}

export interface PriceAdjustmentResult {
    decision: 'apply-directly' | 'requires-approval';
    approvalRequestId: string | null;
}

export async function requestPriceAdjustment(
    orderId: string,
    orderLineId: string,
    requestedPrice: number,
    justification?: string,
): Promise<PriceAdjustmentResult> {
    const result = await adminApi(RequestPriceAdjustmentDocument, {
        orderId,
        orderLineId,
        requestedPrice,
        justification,
    });
    return result.requestPriceAdjustment as PriceAdjustmentResult;
}

// One option per payment form: cash, bank transfer (offline-terms), card (online-stub).
export const PAYMENT_METHOD_OPTIONS = [
    { value: 'cash', label: 'Cash' },
    { value: 'online-stub', label: 'Online payment' },
    { value: 'offline-terms', label: 'Bank transfer (proforma invoice)' },
] as const;

export type DeliveryMethod = 'pickup' | 'courier';

export const DELIVERY_METHOD_OPTIONS = [
    { value: 'pickup', label: 'Self-pickup' },
    { value: 'courier', label: 'Courier delivery' },
] as const;

const SHIPPING_CODE_BY_DELIVERY: Record<DeliveryMethod, string> = {
    pickup: 'pickup',
    courier: 'freight-delivery',
};

export async function setDraftOrderTradingPoint(
    orderId: string,
    tradingPointId: string | null,
): Promise<void> {
    await adminApi(SetDraftOrderTradingPointDocument, { orderId, tradingPointId });
}

export async function finalizeOrder(
    orderId: string,
    delivery: { method: DeliveryMethod; tradingPointAddress: string },
    paymentMethod: string,
): Promise<{ code: string }> {
    await adminApi(SetDraftOrderShippingAddressDocument, {
        orderId,
        input: {
            streetLine1: (delivery.method === 'courier' && delivery.tradingPointAddress) || 'N/A',
            countryCode: 'RU',
        },
    });

    const eligible = await adminApi(EligibleShippingMethodsForDraftOrderDocument, { orderId });
    const shippingMethod = eligible.eligibleShippingMethodsForDraftOrder.find(
        m => m.code === SHIPPING_CODE_BY_DELIVERY[delivery.method],
    );
    if (!shippingMethod) throw new Error('The chosen delivery method is not available');
    await adminApi(SetDraftOrderShippingMethodDocument, { orderId, id: shippingMethod.id });

    const transition = await adminApi(TransitionOrderToStateDocument, { id: orderId });
    if (
        !transition.transitionOrderToState ||
        transition.transitionOrderToState.__typename !== 'Order'
    ) {
        throw new Error(
            transition.transitionOrderToState && 'message' in transition.transitionOrderToState
                ? (transition.transitionOrderToState.message ?? 'Could not proceed to payment')
                : 'Could not proceed to payment',
        );
    }

    const payment = await adminApi(AddManualPaymentToOrderDocument, {
        input: { orderId, method: paymentMethod, metadata: {} },
    });
    if (payment.addManualPaymentToOrder.__typename !== 'Order') {
        throw new Error(payment.addManualPaymentToOrder.message ?? 'Could not place order');
    }
    return { code: payment.addManualPaymentToOrder.code };
}
