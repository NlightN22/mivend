<script setup lang="ts">
import { onMounted } from 'vue';
import { useCartStore } from '../../stores/cart';
import { useCheckoutStore } from '../../stores/checkout';
import PaymentMethodSelector from './PaymentMethodSelector.vue';
import DeliverySelector from './DeliverySelector.vue';
import CheckoutOrderItems from './CheckoutOrderItems.vue';
import CheckoutSummary from './CheckoutSummary.vue';

const cartStore = useCartStore();
const checkoutStore = useCheckoutStore();

onMounted(() => cartStore.fetchCart());
</script>

<template>
    <main class="checkout-page">
        <MvBreadcrumbs
            class="checkout-page__crumbs"
            :items="[{ label: 'Cart', to: '/cart' }, { label: 'Checkout' }]"
        />

        <div class="checkout-page__head">
            <h1 class="checkout-page__title">Checkout</h1>
        </div>

        <div class="checkout-page__layout">
            <section class="checkout-page__main">
                <PaymentMethodSelector />
                <DeliverySelector />
                <CheckoutOrderItems />
                <MvNotice v-if="checkoutStore.selectedPayment === 'online'" variant="info">
                    After clicking "Pay online" you will be redirected to the payment service.
                    Order status is updated via webhook, not only on customer return.
                </MvNotice>
            </section>

            <CheckoutSummary class="checkout-page__side" />
        </div>
    </main>
</template>

<style scoped>
.checkout-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 70px;
}

.checkout-page__crumbs { margin-bottom: 12px; }

.checkout-page__head { margin-bottom: 18px; }

.checkout-page__title {
    margin: 0;
    font-size: clamp(36px, 3.8vw, 54px);
    line-height: 0.98;
    letter-spacing: -0.06em;
}

.checkout-page__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 24px;
    align-items: start;
}

.checkout-page__main { display: grid; gap: 18px; min-width: 0; }

.checkout-page__side {
    position: sticky;
    top: 100px;
}

@media (max-width: 1260px) {
    .checkout-page__layout { grid-template-columns: 1fr; }
    .checkout-page__side { position: static; }
}

@media (max-width: 560px) {
    .checkout-page { padding-left: 16px; padding-right: 16px; }
}
</style>
