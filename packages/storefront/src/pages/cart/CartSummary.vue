<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '../../stores/cart';
import { formatPackaging, useOrderPackaging } from '../../composables/useOrderPackaging';

const router = useRouter();

const cartStore = useCartStore();

const packaging = computed(() => useOrderPackaging(cartStore.lines));
const packagingLabel = computed(() => formatPackaging(packaging.value));

function formatRub(kopecks: number): string {
    return new Intl.NumberFormat('ru-RU').format(kopecks / 100) + ' ₽';
}

const subtotal = computed(() =>
    formatRub((cartStore.order?.subTotalWithTax ?? 0) + cartStore.discountAmount),
);

const discountLabel = computed(() => `− ${formatRub(cartStore.discountAmount)}`);

const total = computed(() => new Intl.NumberFormat('ru-RU').format(cartStore.totalPrice) + ' ₽');

const totalQty = computed(() => cartStore.totalQuantity);
const lineCount = computed(() => cartStore.lines.length);
const unavailableCount = computed(
    () => cartStore.lines.filter(l => l.productVariant.availableForOrder === false).length,
);
</script>

<template>
    <aside class="cart-summary">
        <section class="cart-summary__card">
            <button
                class="cart-summary__checkout"
                type="button"
                :disabled="unavailableCount > 0"
                @click="router.push('/checkout')"
            >
                Proceed to checkout
            </button>
            <p v-if="unavailableCount > 0" class="cart-summary__blocked">
                Remove the items marked "Not available for order" to continue.
            </p>

            <p class="cart-summary__help">
                Delivery method and order comment are selected at the next step.
            </p>

            <div class="cart-summary__title-row">
                <div class="cart-summary__title">Your cart</div>
                <div class="cart-summary__count">{{ lineCount }} items · {{ totalQty }} pcs.</div>
            </div>

            <div class="cart-summary__lines">
                <div v-if="cartStore.discountAmount > 0" class="cart-summary__line">
                    <span>Subtotal</span>
                    <strong>{{ subtotal }}</strong>
                </div>
                <div
                    v-if="cartStore.discountAmount > 0"
                    class="cart-summary__line cart-summary__line--discount"
                >
                    <span>Customer discount</span>
                    <strong>{{ discountLabel }}</strong>
                </div>
                <div class="cart-summary__line">
                    <span>Expected reserve</span>
                    <strong>after ERP</strong>
                </div>
                <div v-if="packagingLabel" class="cart-summary__line">
                    <span>Weight / volume</span>
                    <strong>{{ packagingLabel }}</strong>
                </div>
            </div>

            <div class="cart-summary__total">
                <span>Total</span>
                <strong>{{ total }}</strong>
            </div>
        </section>
    </aside>
</template>

<style scoped>
.cart-summary {
    display: grid;
    gap: 14px;
}

.cart-summary__card {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 24px;
}

.cart-summary__checkout {
    width: 100%;
    min-height: 56px;
    border: none;
    border-radius: 18px;
    background: #00a878;
    color: #fff;
    font-size: 16px;
    font-weight: 800;
    font-family: inherit;
    cursor: pointer;
    margin-bottom: 16px;
    transition: background 0.15s;
}
.cart-summary__checkout:hover {
    background: #008a64;
}
.cart-summary__checkout:disabled {
    background: #c5cdc9;
    cursor: not-allowed;
}

.cart-summary__blocked {
    margin: -4px 0 16px;
    color: #991b1b;
    font-size: 13px;
    line-height: 1.45;
}

.cart-summary__help {
    margin: 0 0 18px;
    color: #66736e;
    font-size: 13px;
    line-height: 1.45;
    padding-bottom: 18px;
    border-bottom: 1px solid #edf2ef;
}

.cart-summary__title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 16px;
}
.cart-summary__title {
    font-size: 21px;
    font-weight: 950;
    letter-spacing: -0.035em;
}
.cart-summary__count {
    color: #66736e;
    font-size: 13px;
    font-weight: 850;
}

.cart-summary__lines {
    display: grid;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid #edf2ef;
}
.cart-summary__line {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 14px;
    line-height: 1.3;
}
.cart-summary__line span {
    color: #53645e;
}
.cart-summary__line strong {
    white-space: nowrap;
    color: #2c3b36;
}
.cart-summary__line--discount strong {
    color: #e40066;
}

.cart-summary__total {
    margin-top: 18px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
}
.cart-summary__total span {
    font-size: 20px;
    font-weight: 950;
    letter-spacing: -0.04em;
}
.cart-summary__total strong {
    color: #008a64;
    font-size: 27px;
    font-weight: 950;
    letter-spacing: -0.045em;
    white-space: nowrap;
}
</style>
