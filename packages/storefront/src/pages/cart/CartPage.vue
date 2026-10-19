<script setup lang="ts">
import { onMounted } from 'vue';
import { useCartStore } from '../../stores/cart';
import CartItemList from './CartItemList.vue';
import EmptyCartState from '../../components/EmptyCartState.vue';
import CartSkeleton from './CartSkeleton.vue';
import CartSummary from './CartSummary.vue';
import CartPromoBanner from './CartPromoBanner.vue';

const cartStore = useCartStore();

onMounted(() => cartStore.fetchCart());
</script>

<template>
    <main class="cart-page">
        <MvBreadcrumbs
            class="cart-page__crumbs"
            :items="[{ label: $t('nav.home'), to: '/' }, { label: $t('cart.title') }]"
        />

        <div class="cart-page__title-row">
            <h1 class="cart-page__title">
                {{ $t('cart.title') }}
                <span v-if="cartStore.loaded" class="cart-page__count">
                    {{ $t('cart.items', cartStore.lines.length) }}
                </span>
            </h1>
            <p class="cart-page__hint">
                {{ $t('cart.hint') }}
            </p>
        </div>

        <CartSkeleton v-if="!cartStore.loaded" />

        <EmptyCartState v-else-if="cartStore.isEmpty" />

        <template v-else>
            <div class="cart-page__layout">
                <CartItemList />
                <div class="cart-page__aside">
                    <CartSummary />
                    <CartPromoBanner />
                </div>
            </div>
        </template>

        <!-- TODO: recently viewed -->
    </main>
</template>

<style scoped>
.cart-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 32px 28px 70px;
}

.cart-page__crumbs {
    margin-bottom: 18px;
}

.cart-page__title-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 26px;
}

.cart-page__title {
    margin: 0;
    font-size: 42px;
    line-height: 0.95;
    letter-spacing: -0.055em;
}

.cart-page__count {
    color: #66736e;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-left: 10px;
}

.cart-page__hint {
    margin: 0;
    color: #66736e;
    font-size: 14px;
    max-width: 540px;
    text-align: right;
    line-height: 1.45;
}

.cart-page__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 24px;
    align-items: start;
}

.cart-page__aside {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

@media (max-width: 1180px) {
    .cart-page__layout {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 900px) {
    .cart-page__title-row {
        display: block;
    }
    .cart-page__hint {
        text-align: left;
        margin-top: 8px;
    }
}

@media (max-width: 560px) {
    .cart-page {
        padding-left: 16px;
        padding-right: 16px;
    }
    .cart-page__title {
        font-size: 32px;
    }
}
</style>
