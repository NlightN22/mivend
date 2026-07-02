import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { shopApi } from '../api/client';

interface ProductVariant {
    id: string;
    sku: string;
    name: string;
    price: number;
    currencyCode: string;
    stockLevel: string;
    product: {
        id: string;
        name: string;
        slug: string;
        facetValues: { name: string; facet: { code: string } }[];
    };
}

export interface CartLine {
    id: string;
    quantity: number;
    linePrice: number;
    linePriceWithTax: number;
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
                id quantity linePrice linePriceWithTax
                productVariant {
                    id sku name price currencyCode stockLevel
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

    async function addItem(variantId: string, qty: number): Promise<void> {
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
        try {
            // Request real lineId in response so we can replace the temp id before fetchCart
            const result = await shopApi<{
                addItemToOrder: {
                    __typename: string;
                    lines?: { id: string; quantity: number; productVariant: { id: string } }[];
                };
            }>(
                `
                mutation AddToCart($variantId: ID!, $qty: Int!) {
                    addItemToOrder(productVariantId: $variantId, quantity: $qty) {
                        __typename
                        ... on Order {
                            id totalWithTax
                            lines { id quantity productVariant { id } }
                        }
                        ... on ErrorResult { errorCode message }
                    }
                }
            `,
                { variantId, qty },
            );
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
        } finally {
            pendingMutations--;
        }
        await fetchCart();
    }

    async function adjustItem(lineId: string, qty: number): Promise<void> {
        // Optimistic update — reflect change immediately, sync with server after
        if (order.value) {
            order.value = {
                ...order.value,
                lines: order.value.lines
                    .map(l => (l.id === lineId ? { ...l, quantity: qty } : l))
                    .filter(l => l.quantity > 0),
            };
        }
        pendingMutations++;
        try {
            await shopApi(
                `
                mutation AdjustCartLine($lineId: ID!, $qty: Int!) {
                    adjustOrderLine(orderLineId: $lineId, quantity: $qty) {
                        __typename
                        ... on Order { id totalWithTax lines { id quantity } }
                        ... on ErrorResult { errorCode message }
                    }
                }
            `,
                { lineId, qty },
            );
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
    };
});
