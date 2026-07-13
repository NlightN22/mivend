import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { toast } from '@mivend/ui-kit';
import { shopApi } from '../api/client';
import {
    stockAddFailed,
    stockInsufficient,
    stockInsufficientGeneric,
    stockUpdateFailed,
} from '../utils/discountMessages';

interface MutationResult {
    __typename: string;
    errorCode?: string;
    message?: string;
    quantityAvailable?: number;
}

// Vendure's InsufficientStockError.message is a full server-composed sentence
// ("Only N items were added to the order due to insufficient stock") — replace it
// with a short message; quantityAvailable lets us say how many, when known.
function mutationErrorMessage(result: MutationResult, fallback: string): string {
    if (result.errorCode === 'INSUFFICIENT_STOCK_ERROR') {
        return result.quantityAvailable != null
            ? stockInsufficient(result.quantityAvailable)
            : stockInsufficientGeneric;
    }
    return fallback;
}

interface ProductVariant {
    id: string;
    sku: string;
    name: string;
    price: number;
    currencyCode: string;
    stockLevel: string;
    customFields: { weight: number | null };
    product: {
        id: string;
        name: string;
        slug: string;
        facetValues: { name: string; facet: { code: string } }[];
    };
}

export interface TierProgress {
    facetName: string;
    metric: 'WEIGHT' | 'AMOUNT';
    current: number;
    currentPercent: number | null;
    nextThreshold: number | null;
    nextPercent: number | null;
}

export interface CartLine {
    id: string;
    quantity: number;
    linePrice: number;
    linePriceWithTax: number;
    unitPrice: number;
    compareAtPrice: number | null;
    tierProgress: TierProgress | null;
    productVariant: ProductVariant;
}

interface ActiveOrder {
    id: string;
    state: string;
    totalWithTax: number;
    subTotalWithTax: number;
    lines: CartLine[];
}

const ACTIVE_ORDER_QUERY = `
    query ActiveOrder {
        activeOrder {
            id state totalWithTax subTotalWithTax
            lines {
                id quantity linePrice linePriceWithTax unitPrice compareAtPrice
                tierProgress {
                    facetName metric current currentPercent nextThreshold nextPercent
                }
                productVariant {
                    id sku name price currencyCode stockLevel
                    customFields { weight }
                    product {
                        id name slug
                        facetValues { name facet { code } }
                    }
                }
            }
        }
    }
`;

export const useCartStore = defineStore('cart', () => {
    const order = ref<ActiveOrder | null>(null);
    // Counts in-flight adjust/remove mutations; fetchCart skips update while non-zero
    let pendingMutations = 0;

    const lines = computed(() => order.value?.lines ?? []);
    const itemCount = computed(() => lines.value.length);
    const totalPrice = computed(() => (order.value?.totalWithTax ?? 0) / 100);
    const isEmpty = computed(() => lines.value.length === 0);

    async function fetchCart(): Promise<void> {
        try {
            const result = await shopApi<{ activeOrder: ActiveOrder | null }>(ACTIVE_ORDER_QUERY);
            if (pendingMutations === 0) order.value = result.activeOrder;
        } catch {
            if (pendingMutations === 0) order.value = null;
        }
    }

    async function addItem(
        variantId: string,
        qty: number,
    ): Promise<{ brand: string; percent: number } | null> {
        // Optimistic: insert a temp line so badge + stepper appear instantly
        const tempId = `optimistic-${variantId}`;
        if (order.value) {
            const existing = order.value.lines.find(l => l.productVariant.id === variantId);
            if (existing) {
                order.value = {
                    ...order.value,
                    lines: order.value.lines.map(l =>
                        l.id === existing.id ? { ...l, quantity: l.quantity + qty } : l,
                    ),
                };
            } else {
                order.value = {
                    ...order.value,
                    lines: [
                        ...order.value.lines,
                        {
                            id: tempId,
                            quantity: qty,
                            productVariant: { id: variantId },
                        } as CartLine,
                    ],
                };
            }
        }
        pendingMutations++;
        let realLineId: string | undefined;
        let discountResult: { brand: string; percent: number } | null = null;
        try {
            // Request real lineId + the real applied price in the response so the
            // caller can show an accurate discount toast — not a pre-add guess from
            // catalog-level flat compareAtPrice, which can't see a tier this add just
            // unlocked (or a tier this add crosses out of, once other lines shrink).
            type AddToCartResult = {
                addItemToOrder: MutationResult & {
                    lines?: {
                        id: string;
                        quantity: number;
                        unitPrice: number;
                        compareAtPrice: number | null;
                        productVariant: {
                            id: string;
                            product: {
                                facetValues: { name: string; facet: { code: string } }[];
                            };
                        };
                    }[];
                };
            };
            const addToCart = (): Promise<AddToCartResult> =>
                shopApi<AddToCartResult>(
                    `
                mutation AddToCart($variantId: ID!, $qty: Int!) {
                    addItemToOrder(productVariantId: $variantId, quantity: $qty) {
                        __typename
                        ... on Order {
                            id totalWithTax
                            lines {
                                id quantity unitPrice compareAtPrice
                                productVariant {
                                    id
                                    product { facetValues { name facet { code } } }
                                }
                            }
                        }
                        ... on InsufficientStockError { errorCode message quantityAvailable }
                        ... on ErrorResult { errorCode message }
                    }
                }
            `,
                    { variantId, qty },
                );
            let result = await addToCart();
            if (
                result.addItemToOrder.__typename !== 'Order' &&
                result.addItemToOrder.errorCode === 'ORDER_MODIFICATION_ERROR'
            ) {
                // The customer's active order was left mid-checkout (transitioned to
                // ArrangingPayment but never settled — e.g. they backed out of payment).
                // Vendure forbids adding items outside AddingItems; since this order was
                // never actually paid, bringing it back to AddingItems is safe and lets
                // the customer keep shopping instead of being permanently blocked.
                await shopApi(
                    `mutation { transitionOrderToState(state: "AddingItems") { __typename } }`,
                );
                result = await addToCart();
            }
            if (result.addItemToOrder.__typename !== 'Order') {
                // Optimistic line gets discarded below by fetchCart() — surface why.
                toast(mutationErrorMessage(result.addItemToOrder, stockAddFailed), 'error');
            } else {
                const serverLine = result.addItemToOrder.lines?.find(
                    l => l.productVariant.id === variantId,
                );
                realLineId = serverLine?.id;
                if (realLineId && order.value) {
                    // Replace temp id with real id so stepper adjustments use the correct lineId
                    order.value = {
                        ...order.value,
                        lines: order.value.lines.map(l =>
                            l.id === tempId ? { ...l, id: realLineId! } : l,
                        ),
                    };
                }
                if (serverLine?.compareAtPrice != null && serverLine.unitPrice != null) {
                    const percent = Math.round(
                        (1 - serverLine.unitPrice / serverLine.compareAtPrice) * 100,
                    );
                    const brand = serverLine.productVariant.product.facetValues.find(
                        fv => fv.facet.code === 'brand',
                    )?.name;
                    if (percent > 0 && brand) discountResult = { brand, percent };
                }
            }
        } finally {
            pendingMutations--;
        }
        await fetchCart();
        return discountResult;
    }

    async function adjustItem(lineId: string, qty: number): Promise<void> {
        // Optimistic update — reflect change immediately, sync with server after.
        // Scale the displayed line total by the same ratio so it doesn't sit stale
        // (wrong digit count for the new quantity) until fetchCart() resolves, which
        // reads as the price "jumping" a moment later.
        if (order.value) {
            order.value = {
                ...order.value,
                lines: order.value.lines
                    .map(l => {
                        if (l.id !== lineId) return l;
                        const ratio = l.quantity > 0 ? qty / l.quantity : 1;
                        return {
                            ...l,
                            quantity: qty,
                            linePrice: Math.round(l.linePrice * ratio),
                            linePriceWithTax: Math.round(l.linePriceWithTax * ratio),
                        };
                    })
                    .filter(l => l.quantity > 0),
            };
        }
        pendingMutations++;
        try {
            const result = await shopApi<{ adjustOrderLine: MutationResult }>(
                `
                mutation AdjustCartLine($lineId: ID!, $qty: Int!) {
                    adjustOrderLine(orderLineId: $lineId, quantity: $qty) {
                        __typename
                        ... on Order { id totalWithTax lines { id quantity } }
                        ... on InsufficientStockError { errorCode message quantityAvailable }
                        ... on ErrorResult { errorCode message }
                    }
                }
            `,
                { lineId, qty },
            );
            if (result.adjustOrderLine.__typename !== 'Order') {
                // fetchCart() below re-syncs to whatever quantity the server actually
                // applied (Vendure's InsufficientStockError can be a partial success) —
                // surface why it differs from what the user asked for.
                toast(mutationErrorMessage(result.adjustOrderLine, stockUpdateFailed), 'error');
            }
        } finally {
            pendingMutations--;
        }
        await fetchCart();
    }

    async function removeItem(lineId: string): Promise<void> {
        // Optimistic update
        if (order.value) {
            order.value = {
                ...order.value,
                lines: order.value.lines.filter(l => l.id !== lineId),
            };
        }
        pendingMutations++;
        try {
            await shopApi(
                `
                mutation RemoveCartLine($lineId: ID!) {
                    removeOrderLine(orderLineId: $lineId) {
                        __typename
                        ... on Order { id totalWithTax lines { id quantity } }
                        ... on ErrorResult { errorCode message }
                    }
                }
            `,
                { lineId },
            );
        } finally {
            pendingMutations--;
        }
        await fetchCart();
    }

    async function clearCart(): Promise<void> {
        // Single mutation — not a loop of removeItem() calls, one per line.
        if (order.value) order.value = { ...order.value, lines: [] };
        pendingMutations++;
        try {
            await shopApi(
                `mutation { removeAllOrderLines { __typename ... on Order { id totalWithTax } ... on ErrorResult { errorCode message } } }`,
            );
        } finally {
            pendingMutations--;
        }
        await fetchCart();
    }

    // Moves the order from AddingItems to ArrangingPayment — required before any
    // addPaymentToOrder call. Vendure refuses this transition without a shipping
    // method attached, so pick the (currently single) eligible one first.
    async function beginCheckout(): Promise<boolean> {
        const eligible = await shopApi<{
            eligibleShippingMethods: { id: string }[];
        }>(`query { eligibleShippingMethods { id } }`);
        const methodId = eligible.eligibleShippingMethods[0]?.id;
        if (!methodId) {
            toast('No shipping method available', 'error');
            return false;
        }
        const setMethodResult = await shopApi<{ setOrderShippingMethod: MutationResult }>(
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename ... on ErrorResult { errorCode message } } }`,
            { id: [methodId] },
        );
        if (setMethodResult.setOrderShippingMethod.__typename !== 'Order') {
            toast(
                setMethodResult.setOrderShippingMethod.message ?? 'Could not set shipping method',
                'error',
            );
            return false;
        }
        const transitionResult = await shopApi<{ transitionOrderToState: MutationResult }>(
            `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename ... on ErrorResult { errorCode message } } }`,
        );
        if (transitionResult.transitionOrderToState.__typename !== 'Order') {
            toast(
                transitionResult.transitionOrderToState.message ?? 'Could not proceed to payment',
                'error',
            );
            return false;
        }
        return true;
    }

    // Offline payment terms (invoice / deferred) settle immediately in Vendure's
    // payment flow — actual money collection happens outside the system, tracked
    // via the existing ERP status sync, not via Vendure's payment state.
    async function completeOfflinePayment(): Promise<boolean> {
        const result = await shopApi<{ addPaymentToOrder: MutationResult }>(
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename ... on ErrorResult { errorCode message } } }`,
        );
        await fetchCart();
        if (result.addPaymentToOrder.__typename !== 'Order') {
            toast(result.addPaymentToOrder.message ?? 'Could not place order', 'error');
            return false;
        }
        return true;
    }

    async function completeOnlinePayment(status: 'success' | 'pending' | 'fail'): Promise<boolean> {
        const result = await shopApi<{ addPaymentToOrder: MutationResult }>(
            `mutation($status: JSON!) { addPaymentToOrder(input: { method: "online-stub", metadata: $status }) { __typename ... on ErrorResult { errorCode message } } }`,
            { status: { status } },
        );
        await fetchCart();
        return result.addPaymentToOrder.__typename === 'Order';
    }

    async function removeItems(lineIds: string[]): Promise<void> {
        // No batch "remove these N lines" mutation on the Shop API (only single-line
        // removeOrderLine or all-lines removeAllOrderLines) — this is an unavoidable
        // loop, unlike clearCart() above. One fetchCart() at the end, not per line.
        if (order.value) {
            const idSet = new Set(lineIds);
            order.value = {
                ...order.value,
                lines: order.value.lines.filter(l => !idSet.has(l.id)),
            };
        }
        pendingMutations++;
        try {
            await Promise.all(
                lineIds.map(lineId =>
                    shopApi(
                        `mutation($lineId: ID!) { removeOrderLine(orderLineId: $lineId) { __typename ... on ErrorResult { errorCode message } } }`,
                        { lineId },
                    ),
                ),
            );
        } finally {
            pendingMutations--;
        }
        await fetchCart();
    }

    return {
        order,
        lines,
        itemCount,
        totalPrice,
        isEmpty,
        fetchCart,
        addItem,
        adjustItem,
        removeItem,
        removeItems,
        clearCart,
        beginCheckout,
        completeOfflinePayment,
        completeOnlinePayment,
    };
});
