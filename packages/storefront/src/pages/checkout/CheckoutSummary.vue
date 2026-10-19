<script setup lang="ts">
import { formatMoney } from '../../i18n/format';
import { ref, computed } from 'vue';
import { toast } from '@mivend/ui-kit';
import { useCartStore } from '../../stores/cart';
import { useCheckoutStore, type DeliveryType } from '../../stores/checkout';
import { useOrderPlacement } from '../../composables/useOrderPlacement';
import { cardExcess } from '../../utils/checkoutPolicy';
import { useCurrency } from '../../composables/useCurrency';
import CreditLimitNotice from './CreditLimitNotice.vue';
import { formatPackaging, useOrderPackaging } from '../../composables/useOrderPackaging';

const cartStore = useCartStore();
const checkoutStore = useCheckoutStore();
const submitting = ref(false);

const packaging = computed(() => useOrderPackaging(cartStore.lines));
const packagingLabel = computed(() => formatPackaging(packaging.value));

const lineCount = computed(() => cartStore.lines.length);
const totalQty = computed(() => cartStore.totalQuantity);

const { formatWhole } = useCurrency();
const creditPreview = computed(() =>
    checkoutStore.creditPreview?.limitControlled ? checkoutStore.creditPreview : null,
);
const cardPayable = computed(() =>
    checkoutStore.selectedPayment === 'card'
        ? (checkoutStore.creditPreview?.payableCardAmount ?? 0)
        : 0,
);
const excess = computed(() => cardExcess(cardPayable.value, cartStore.totalPrice));
const overLimit = computed(() =>
    creditPreview.value
        ? Math.max(creditPreview.value.orderAmount - creditPreview.value.availableCredit, 0)
        : 0,
);

function formatRub(kopecks: number): string {
    return formatMoney(kopecks / 100, 'RUB', { maximumFractionDigits: 2 });
}

const subtotal = computed(() =>
    formatRub((cartStore.order?.subTotalWithTax ?? 0) + cartStore.discountAmount),
);
const discountLabel = computed(() => `− ${formatRub(cartStore.discountAmount)}`);

const total = computed(() =>
    formatMoney(cartStore.totalPrice, 'RUB', { maximumFractionDigits: 2 }),
);

const btnLabel = computed(() => {
    if (checkoutStore.selectedPayment === 'card')
        return cardPayable.value > 0
            ? `Pay ${formatRub(cardPayable.value * 100)} →`
            : 'Pay online →';
    if (checkoutStore.selectedPayment === 'bank-transfer')
        return 'Place order & get proforma invoice';
    return 'Place order';
});

const DELIVERY_LABELS: Record<DeliveryType, string> = { courier: 'Courier', pickup: 'Self-pickup' };
const deliveryLabel = computed(() => DELIVERY_LABELS[checkoutStore.selectedDelivery]);

const btnOrange = computed(() => checkoutStore.selectedPayment === 'card');

const { place } = useOrderPlacement();

async function handlePrimary(): Promise<void> {
    if (submitting.value) return;
    submitting.value = true;
    try {
        await place();
    } catch (err) {
        console.error('Checkout failed', err);
        toast('Could not place order, please try again or contact support', 'error');
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <aside class="checkout-summary">
        <div class="checkout-summary__card">
            <div class="checkout-summary__title">Your order</div>
            <div class="checkout-summary__caption">{{ lineCount }} items · {{ totalQty }} pcs.</div>

            <div v-if="cartStore.discountAmount > 0" class="checkout-summary__line">
                <span>Goods</span>
                <strong>{{ subtotal }}</strong>
            </div>
            <div class="checkout-summary__line">
                <span>Delivery</span>
                <strong>{{ deliveryLabel }}</strong>
            </div>
            <div v-if="cartStore.discountAmount > 0" class="checkout-summary__line">
                <span>Customer discount</span>
                <strong class="checkout-summary__discount">{{ discountLabel }}</strong>
            </div>
            <div v-if="packagingLabel" class="checkout-summary__line">
                <span>Weight / volume</span>
                <strong>{{ packagingLabel }}</strong>
            </div>

            <template v-if="creditPreview">
                <div class="checkout-summary__line">
                    <span>Available credit</span>
                    <strong>{{ formatWhole(Math.max(creditPreview.availableCredit, 0)) }}</strong>
                </div>
                <div v-if="creditPreview.exceeded" class="checkout-summary__line">
                    <span>Over the limit by</span>
                    <strong class="checkout-summary__discount">{{ formatWhole(overLimit) }}</strong>
                </div>
            </template>

            <template v-if="cardPayable > 0">
                <div class="checkout-summary__line">
                    <span>To pay online</span>
                    <strong>{{ formatRub(cardPayable * 100) }}</strong>
                </div>
                <p v-if="excess > 0" class="checkout-summary__legal">
                    Includes {{ formatRub(excess * 100) }} of debt above your credit limit; paying
                    online clears it together with this order.
                </p>
            </template>

            <div class="checkout-summary__total">
                <span>Total</span>
                <strong>{{ total }}</strong>
            </div>

            <CreditLimitNotice class="checkout-summary__credit" />

            <button
                class="checkout-summary__pay-btn"
                :class="
                    btnOrange
                        ? 'checkout-summary__pay-btn--orange'
                        : 'checkout-summary__pay-btn--green'
                "
                type="button"
                :disabled="submitting || !checkoutStore.canPlaceOrder"
                @click="handlePrimary"
            >
                {{ submitting ? 'Processing…' : btnLabel }}
            </button>

            <p v-if="checkoutStore.selectedPayment === 'card'" class="checkout-summary__legal">
                By clicking the button, you are redirected to the payment service and agree to the
                <a href="#">payment terms</a>.
            </p>
        </div>
    </aside>
</template>

<style scoped>
.checkout-summary {
    display: grid;
    gap: 14px;
}

.checkout-summary__card {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
}

.checkout-summary__title {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.045em;
    margin-bottom: 4px;
}

.checkout-summary__caption {
    color: #66736e;
    font-size: 13px;
    margin-bottom: 14px;
}

.checkout-summary__line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #edf2ef;
    color: #66736e;
    font-size: 14px;
}

.checkout-summary__line strong {
    color: #263732;
    text-align: right;
    font-weight: 700;
}

.checkout-summary__discount {
    color: #d92d20 !important;
    font-weight: 800 !important;
}

.checkout-summary__total {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 15px 0 8px;
    font-size: 18px;
    font-weight: 800;
}

.checkout-summary__total strong {
    font-size: 22px;
    letter-spacing: -0.04em;
}

.checkout-summary__credit {
    margin-bottom: 14px;
    font-size: 13px;
}

.checkout-summary__pay-btn {
    width: 100%;
    min-height: 56px;
    border: 0;
    border-radius: 18px;
    color: #fff;
    font: inherit;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    margin-top: 12px;
    transition: background 0.15s;
}

.checkout-summary__pay-btn--orange {
    background: var(--app-accent-orange, #ff8a00);
    box-shadow: 0 12px 24px rgba(255, 138, 0, 0.22);
}
.checkout-summary__pay-btn--orange:hover {
    background: var(--app-accent-orange-hover, #e67c00);
}
.checkout-summary__pay-btn--orange:active {
    background: var(--app-accent-orange-active, #cc6e00);
}

.checkout-summary__pay-btn--green {
    background: #00a878;
    box-shadow: 0 12px 24px rgba(0, 168, 120, 0.22);
}
.checkout-summary__pay-btn--green:hover {
    background: #008a64;
}

.checkout-summary__legal {
    margin: 12px 0 0;
    color: #66736e;
    font-size: 12px;
    line-height: 1.4;
}

.checkout-summary__legal a {
    color: #008a64;
    font-weight: 800;
}

.checkout-summary__pay-btn:disabled {
    background: #c9d2ce;
    box-shadow: none;
    color: #fff;
    cursor: not-allowed;
}
</style>
