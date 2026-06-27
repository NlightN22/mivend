<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCartStore } from '../../stores/cart';

const cartStore = useCartStore();
const promoCode = ref('');

const lineCount = computed(() => cartStore.lines.length);
const totalQty = computed(() => cartStore.itemCount);

const subtotal = computed(() =>
    new Intl.NumberFormat('ru-RU').format((cartStore.order?.subTotalWithTax ?? 0) / 100) + ' ₽',
);

const total = computed(() =>
    new Intl.NumberFormat('ru-RU').format(cartStore.totalPrice) + ' ₽',
);
</script>

<template>
    <aside class="checkout-summary">
        <div class="checkout-summary__card">
            <div class="checkout-summary__title">Your order</div>
            <div class="checkout-summary__caption">{{ lineCount }} items · {{ totalQty }} pcs.</div>

            <div class="checkout-summary__line">
                <span>Goods</span>
                <strong>{{ subtotal }}</strong>
            </div>
            <div class="checkout-summary__line">
                <span>Delivery</span>
                <strong>Per contract</strong>
            </div>
            <div class="checkout-summary__line">
                <span>Customer discount</span>
                <strong class="checkout-summary__discount">— 0 ₽</strong>
            </div>

            <div class="checkout-summary__total">
                <span>Total</span>
                <strong>{{ total }}</strong>
            </div>

            <button class="checkout-summary__pay-btn" type="button">Pay online</button>
            <button class="checkout-summary__secondary-btn" type="button">Generate invoice</button>

            <p class="checkout-summary__legal">
                By clicking the button, you are redirected to the payment service and agree to the
                <a href="#">payment terms</a>.
            </p>
        </div>

        <div class="checkout-summary__promo-card">
            <div class="checkout-summary__promo-title">Promo code or certificate</div>
            <div class="checkout-summary__promo-row">
                <input
                    v-model="promoCode"
                    class="checkout-summary__promo-input"
                    placeholder="Enter code"
                    type="text"
                />
                <button class="checkout-summary__promo-btn" type="button">Apply</button>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.checkout-summary { display: grid; gap: 14px; }

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

.checkout-summary__discount { color: #d92d20 !important; font-weight: 800 !important; }

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

.checkout-summary__pay-btn {
    width: 100%;
    min-height: 56px;
    border: 0;
    border-radius: 18px;
    background: #ff8a00;
    color: #fff;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 12px 24px rgba(255, 138, 0, 0.22);
    margin-top: 12px;
    font: inherit;
    font-size: 16px;
    font-weight: 800;
    transition: background 0.15s;
}

.checkout-summary__pay-btn:hover { background: #e87800; }

.checkout-summary__secondary-btn {
    width: 100%;
    min-height: 46px;
    border: 0;
    border-radius: 15px;
    background: #f3f8f6;
    color: #263732;
    font-weight: 800;
    cursor: pointer;
    margin-top: 9px;
    font: inherit;
    transition: background 0.15s;
}

.checkout-summary__secondary-btn:hover { background: #e8f2ed; }

.checkout-summary__legal {
    margin: 12px 0 0;
    color: #66736e;
    font-size: 12px;
    line-height: 1.4;
}

.checkout-summary__legal a { color: #008a64; font-weight: 800; }

.checkout-summary__promo-card {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
    display: grid;
    gap: 10px;
}

.checkout-summary__promo-title {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.04em;
}

.checkout-summary__promo-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
}

.checkout-summary__promo-input {
    min-height: 44px;
    border: 1px solid #dde7e2;
    border-radius: 14px;
    outline: none;
    padding: 0 13px;
    font: inherit;
    font-weight: 700;
}

.checkout-summary__promo-btn {
    border: 0;
    min-height: 40px;
    border-radius: 13px;
    padding: 0 14px;
    background: #00a878;
    color: #fff;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    font: inherit;
    transition: background 0.15s;
}

.checkout-summary__promo-btn:hover { background: #008a64; }
</style>
