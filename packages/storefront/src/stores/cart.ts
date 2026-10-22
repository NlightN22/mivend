import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { toast } from '@mivend/ui-kit';
import { shopApi } from '../api/client';
import { brandOf } from '../utils/brand';
import { SHIPPING_CODE_BY_DELIVERY } from '../utils/deliveryMethods';
import { cardPaymentMetadata, isCardAmountChanged } from '../utils/checkoutPolicy';
import { useCheckoutStore } from './checkout';
import {
    AddToCartDocument,
    AdjustCartLineDocument,
    ActiveOrderDocument,
    CompleteOnlinePaymentDocument,
    EligibleShippingMethodsForCheckoutDocument,
    RemoveAllCartLinesDocument,
    RemoveCartLineDocument,
    RemoveCartLineInBatchDocument,
    ResumeAddingItemsDocument,
    SetOrderShippingMethodForCheckoutDocument,
    TransitionToArrangingPaymentDocument,
    type ActiveOrderQuery,
    type AddToCartMutation,
    type AddToCartMutationVariables,
} from '../api/generated/graphql';
import { stockInsufficient } from '../utils/discountMessages';
import { i18n } from '../i18n';
import { shopErrorMessage } from '../utils/shopErrorMessage';

const ADJUST_DEBOUNCE_MS = 350;
const CART_FETCH_RETRIES = 4;
const CART_FETCH_RETRY_MS = 2000;

interface AdjustWindow {
    timer: ReturnType<typeof setTimeout>;
    fire: () => void;
    done: Promise<void>;
}

interface MutationResult {
    __typename: string;
    errorCode?: string;
    message?: string;
    quantityAvailable?: number;
}

// Vendure's InsufficientStockError.message is a long server-composed sentence;
// replace it with a short one, using quantityAvailable when it is known.
function mutationErrorMessage(result: MutationResult, fallback: string): string {
    if (result.errorCode === 'INSUFFICIENT_STOCK_ERROR') {
        return result.quantityAvailable != null
            ? stockInsufficient(result.quantityAvailable)
            : i18n.global.t('cartErrors.stockGeneric');
    }
    return fallback;
}

export type TierProgress = NonNullable<
    NonNullable<ActiveOrderQuery['activeOrder']>['lines'][number]['tierProgress']
>;

export type CartLine = NonNullable<ActiveOrderQuery['activeOrder']>['lines'][number];

type ActiveOrder = NonNullable<ActiveOrderQuery['activeOrder']>;

export const useCartStore = defineStore('cart', () => {
    const order = ref<ActiveOrder | null>(null);
    const loaded = ref(false);
    // Bumps whenever the order is replaced by a server read, so dependent views refetch.
    const serverVersion = ref(0);
    // Counts in-flight adjust/remove mutations; fetchCart skips update while non-zero
    let pendingMutations = 0;
    // Order mutations run one at a time: parallel ones on one order fail server-side.
    let queue: Promise<unknown> = Promise.resolve();
    const pendingAdjusts = new Map<string, number>();
    const adjustWindows = new Map<string, AdjustWindow>();

    function enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = queue.then(task, task);
        queue = run.catch(() => undefined);
        return run;
    }

    const lines = computed(() => order.value?.lines ?? []);
    const itemCount = computed(() => lines.value.length);
    const totalQuantity = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0));
    const totalPrice = computed(() => (order.value?.totalWithTax ?? 0) / 100);
    // discounted* prices already include every discount (flat in the list price, order-dependent
    // ones as a promotion), so each line's discount is added back to show the pre-discount subtotal.
    const discountAmount = computed(() =>
        lines.value.reduce((sum, line) => {
            if (
                line.compareAtPrice == null ||
                line.discountedUnitPriceWithTax == null ||
                line.discountedUnitPriceWithTax === 0
            )
                return sum;
            const discountRatio =
                (line.compareAtPrice - line.discountedUnitPriceWithTax) /
                line.discountedUnitPriceWithTax;
            return sum + Math.round(line.discountedLinePriceWithTax * discountRatio);
        }, 0),
    );
    const isEmpty = computed(() => lines.value.length === 0);

    // A failed fetch must not look like an empty cart — the server order is untouched.
    async function fetchCart(attempt = 0): Promise<void> {
        if (pendingMutations > 0) return;
        try {
            const result = await shopApi(ActiveOrderDocument);
            if (pendingMutations === 0) {
                order.value = result.activeOrder ?? null;
                serverVersion.value++;
            }
            loaded.value = true;
        } catch {
            if (attempt < CART_FETCH_RETRIES) {
                setTimeout(() => void fetchCart(attempt + 1), CART_FETCH_RETRY_MS * (attempt + 1));
            }
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
        let discountResult: { brand: string; percent: number } | null = null;
        await enqueue(async () => {
            let realLineId: string | undefined;
            try {
                // Return the real lineId and applied price from the server, not a client guess:
                // catalog-level compareAtPrice can't see tiers this add unlocks or crosses out of.
                const addToCart = (): ReturnType<
                    typeof shopApi<AddToCartMutation, AddToCartMutationVariables>
                > => shopApi(AddToCartDocument, { variantId, qty });
                let result = await addToCart();
                if (
                    result.addItemToOrder.__typename !== 'Order' &&
                    result.addItemToOrder.errorCode === 'ORDER_MODIFICATION_ERROR'
                ) {
                    // Vendure forbids adding items outside AddingItems; an order stuck in ArrangingPayment
                    // was never paid, so reverting it to AddingItems is safe.
                    await shopApi(ResumeAddingItemsDocument);
                    result = await addToCart();
                }
                if (result.addItemToOrder.__typename !== 'Order') {
                    // Optimistic line gets discarded below by fetchCart() — surface why.
                    toast(
                        mutationErrorMessage(
                            result.addItemToOrder,
                            i18n.global.t('cartErrors.addFailed'),
                        ),
                        'error',
                    );
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
                    if (
                        serverLine?.compareAtPrice != null &&
                        serverLine.discountedUnitPriceWithTax != null
                    ) {
                        const percent = Math.round(
                            (1 -
                                serverLine.discountedUnitPriceWithTax / serverLine.compareAtPrice) *
                                100,
                        );
                        const brand = brandOf(serverLine.productVariant.product.manufacturer);
                        if (percent > 0 && brand) discountResult = { brand, percent };
                    }
                }
            } finally {
                pendingMutations--;
            }
        });
        await fetchCart();
        return discountResult;
    }

    function adjustItem(lineId: string, qty: number): Promise<void> {
        // Scale the displayed line total by the same ratio, otherwise it shows a stale digit
        // count until fetchCart() resolves and the price visibly jumps.
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
                            discountedLinePrice: Math.round(l.discountedLinePrice * ratio),
                            discountedLinePriceWithTax: Math.round(
                                l.discountedLinePriceWithTax * ratio,
                            ),
                        };
                    })
                    .filter(l => l.quantity > 0),
            };
        }
        pendingAdjusts.set(lineId, qty);
        const open = adjustWindows.get(lineId);
        if (open) {
            clearTimeout(open.timer);
            open.timer = setTimeout(open.fire, ADJUST_DEBOUNCE_MS);
            return open.done;
        }
        pendingMutations++;
        let fire!: () => void;
        const elapsed = new Promise<void>(resolve => {
            fire = resolve;
        });
        const entry: AdjustWindow = {
            timer: setTimeout(fire, ADJUST_DEBOUNCE_MS),
            fire,
            done: Promise.resolve(),
        };
        entry.done = elapsed.then(async () => {
            adjustWindows.delete(lineId);
            await enqueue(() => sendAdjust(lineId));
            await fetchCart();
        });
        adjustWindows.set(lineId, entry);
        return entry.done;
    }

    // An order abandoned mid-checkout stays in ArrangingPayment and Vendure rejects edits there.
    async function resumeIfArrangingPayment(): Promise<void> {
        if (order.value?.state === 'ArrangingPayment') {
            await shopApi(ResumeAddingItemsDocument);
            order.value = { ...order.value, state: 'AddingItems' };
        }
    }

    async function sendAdjust(lineId: string): Promise<void> {
        try {
            await resumeIfArrangingPayment();
            const qty = pendingAdjusts.get(lineId);
            if (qty === undefined) return;
            pendingAdjusts.delete(lineId);
            const result = await shopApi(AdjustCartLineDocument, { lineId, qty });
            if (result.adjustOrderLine.__typename !== 'Order') {
                // fetchCart() re-syncs to whatever quantity the server actually applied
                // (InsufficientStockError can be a partial success).
                toast(
                    mutationErrorMessage(
                        result.adjustOrderLine,
                        i18n.global.t('cartErrors.updateFailed'),
                    ),
                    'error',
                );
            }
        } finally {
            pendingMutations--;
        }
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
        await enqueue(async () => {
            try {
                await resumeIfArrangingPayment();
                await shopApi(RemoveCartLineDocument, { lineId });
            } finally {
                pendingMutations--;
            }
        });
        await fetchCart();
    }

    async function clearCart(): Promise<void> {
        // Single mutation — not a loop of removeItem() calls, one per line.
        if (order.value) order.value = { ...order.value, lines: [] };
        pendingMutations++;
        await enqueue(async () => {
            try {
                await resumeIfArrangingPayment();
                await shopApi(RemoveAllCartLinesDocument);
            } finally {
                pendingMutations--;
            }
        });
        await fetchCart();
    }

    // Vendure refuses the AddingItems -> ArrangingPayment transition without a shipping method,
    // so the method matching the delivery type must be set first.
    async function beginCheckout(): Promise<boolean> {
        // A previous attempt (declined payment, closed tab) can leave the order in ArrangingPayment.
        if (order.value?.state === 'ArrangingPayment') await shopApi(ResumeAddingItemsDocument);
        const checkout = useCheckoutStore();
        if (checkout.deliveryBlocker) {
            toast(checkout.deliveryBlocker, 'error');
            return false;
        }
        const eligible = await shopApi(EligibleShippingMethodsForCheckoutDocument);
        const wantedCode = SHIPPING_CODE_BY_DELIVERY[checkout.selectedDelivery];
        const methodId = eligible.eligibleShippingMethods.find(m => m.code === wantedCode)?.id;
        if (!methodId) {
            toast(i18n.global.t('cartErrors.deliveryUnavailable'), 'error');
            return false;
        }
        const setMethodResult = await shopApi(SetOrderShippingMethodForCheckoutDocument, {
            id: [methodId],
        });
        if (setMethodResult.setOrderShippingMethod.__typename !== 'Order') {
            toast(
                shopErrorMessage(
                    setMethodResult.setOrderShippingMethod,
                    'cartErrors.shippingFailed',
                ),
                'error',
            );
            return false;
        }
        const transitionResult = await shopApi(TransitionToArrangingPaymentDocument);
        const transition = transitionResult.transitionOrderToState;
        if (!transition || transition.__typename !== 'Order') {
            toast(shopErrorMessage(transition, 'cartErrors.paymentFailed'), 'error');
            return false;
        }
        return true;
    }

    async function completeOnlinePayment(
        status: 'success' | 'pending' | 'fail',
    ): Promise<'paid' | 'declined' | 'amount-changed'> {
        const payable = useCheckoutStore().creditPreview?.payableCardAmount ?? null;
        const result = await shopApi(CompleteOnlinePaymentDocument, {
            status: cardPaymentMetadata(status, payable),
        });
        await fetchCart();
        const payment = result.addPaymentToOrder;
        if (payment.__typename === 'Order') return 'paid';
        const message = 'paymentErrorMessage' in payment ? payment.paymentErrorMessage : null;
        return isCardAmountChanged(message) ? 'amount-changed' : 'declined';
    }

    async function removeItems(lineIds: string[]): Promise<void> {
        // The Shop API has no batch line-removal mutation, so this loop is unavoidable;
        // fetch the cart once at the end, not per line.
        if (order.value) {
            const idSet = new Set(lineIds);
            order.value = {
                ...order.value,
                lines: order.value.lines.filter(l => !idSet.has(l.id)),
            };
        }
        pendingMutations++;
        await enqueue(async () => {
            try {
                await resumeIfArrangingPayment();
                await Promise.all(
                    lineIds.map(lineId => shopApi(RemoveCartLineInBatchDocument, { lineId })),
                );
            } finally {
                pendingMutations--;
            }
        });
        await fetchCart();
    }

    return {
        order,
        loaded,
        serverVersion,
        lines,
        itemCount,
        totalQuantity,
        totalPrice,
        discountAmount,
        isEmpty,
        fetchCart,
        addItem,
        adjustItem,
        removeItem,
        removeItems,
        clearCart,
        beginCheckout,
        completeOnlinePayment,
    };
});
