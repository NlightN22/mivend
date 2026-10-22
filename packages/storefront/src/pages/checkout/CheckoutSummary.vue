<script setup lang="ts">
import { formatMoney } from '../../i18n/format';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from '@mivend/ui-kit';
import { useCartStore } from '../../stores/cart';
import { useCheckoutStore, type DeliveryType } from '../../stores/checkout';
import { useOrderPlacement } from '../../composables/useOrderPlacement';
import { cardExcess } from '../../utils/checkoutPolicy';
import { useCurrency } from '../../composables/useCurrency';
import { useDemoMode } from '../../composables/useDemoMode';
import CreditLimitNotice from './CreditLimitNotice.vue';
import { formatPackaging, useOrderPackaging } from '../../composables/useOrderPackaging';

const { t } = useI18n();
const { demoAllowed } = useDemoMode();
const cartStore = useCartStore();
const checkoutStore = useCheckoutStore();
const submitting = ref(false);

const packaging = computed(() => useOrderPackaging(cartStore.lines));
const packagingLabel = computed(() => formatPackaging(packaging.value));

const lineCount = computed(() => cartStore.lines.length);
const totalQty = computed(() => cartStore.totalQuantity);

const { formatCurrencyAmount } = useCurrency();
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
    return formatMoney(kopecks / 100, 'RUB');
}

const subtotal = computed(() =>
    formatRub((cartStore.order?.subTotalWithTax ?? 0) + cartStore.discountAmount),
);
const discountLabel = computed(() => `− ${formatRub(cartStore.discountAmount)}`);

const total = computed(() => formatMoney(cartStore.totalPrice, 'RUB'));

const btnLabel = computed(() => {
    if (checkoutStore.selectedPayment === 'card')
        return cardPayable.value > 0
            ? t('checkout.summary.payAmount', { amount: formatRub(cardPayable.value * 100) })
            : t('checkout.summary.payOnline');
    if (checkoutStore.selectedPayment === 'bank-transfer')
        return t('checkout.summary.placeWithProforma');
    return t('checkout.summary.place');
});

const DELIVERY_KEYS: Record<DeliveryType, string> = {
    courier: 'delivery.courier',
    pickup: 'delivery.pickup',
};
const deliveryLabel = computed(() => t(DELIVERY_KEYS[checkoutStore.selectedDelivery]));

const btnOrange = computed(() => checkoutStore.selectedPayment === 'card');

const { place } = useOrderPlacement();

async function handlePrimary(): Promise<void> {
    if (submitting.value) return;
    submitting.value = true;
    try {
        await place();
    } catch (err) {
        console.error('Checkout failed', err);
        toast(t('checkout.summary.placeFailedRetry'), 'error');
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <aside class="checkout-summary">
        <div class="checkout-summary__card">
            <div class="checkout-summary__title">{{ $t('checkout.yourOrder') }}</div>
            <div class="checkout-summary__caption">
                {{ $t('cartSummary.count', { items: $t('cart.items', lineCount), qty: totalQty }) }}
            </div>

            <div v-if="cartStore.discountAmount > 0" class="checkout-summary__line">
                <span>{{ $t('checkout.summary.goods') }}</span>
                <strong>{{ subtotal }}</strong>
            </div>
            <div class="checkout-summary__line">
                <span>{{ $t('delivery.title') }}</span>
                <strong>{{ deliveryLabel }}</strong>
            </div>
            <div v-if="cartStore.discountAmount > 0" class="checkout-summary__line">
                <span>{{ $t('cartSummary.discount') }}</span>
                <strong class="checkout-summary__discount">{{ discountLabel }}</strong>
            </div>
            <div v-if="packagingLabel" class="checkout-summary__line">
                <span>{{ $t('cartSummary.weightVolume') }}</span>
                <strong>{{ packagingLabel }}</strong>
            </div>

            <template v-if="creditPreview">
                <div class="checkout-summary__line">
                    <span>{{ $t('checkout.summary.availableCredit') }}</span>
                    <strong>{{
                        formatCurrencyAmount(Math.max(creditPreview.availableCredit, 0))
                    }}</strong>
                </div>
                <div v-if="creditPreview.exceeded" class="checkout-summary__line">
                    <span>{{ $t('checkout.summary.overLimit') }}</span>
                    <strong class="checkout-summary__discount">{{
                        formatCurrencyAmount(overLimit)
                    }}</strong>
                </div>
            </template>

            <template v-if="cardPayable > 0">
                <div class="checkout-summary__line">
                    <span>{{ $t('checkout.summary.toPayOnline') }}</span>
                    <strong>{{ formatRub(cardPayable * 100) }}</strong>
                </div>
                <p v-if="excess > 0" class="checkout-summary__legal">
                    {{ $t('checkout.summary.includesDebt', { amount: formatRub(excess * 100) }) }}
                </p>
            </template>

            <div class="checkout-summary__total">
                <span>{{ $t('cartSummary.total') }}</span>
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
                {{ submitting ? $t('checkout.summary.processing') : btnLabel }}
            </button>

            <p
                v-if="demoAllowed && checkoutStore.selectedPayment === 'card'"
                class="checkout-summary__legal"
            >
                <i18n-t keypath="checkout.summary.legal">
                    <template #terms>
                        <RouterLink to="/terms" target="_blank">{{
                            $t('checkout.summary.terms')
                        }}</RouterLink>
                    </template>
                </i18n-t>
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
