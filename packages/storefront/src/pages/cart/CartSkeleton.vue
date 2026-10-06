<script setup lang="ts">
import { MvSkeleton } from '@mivend/ui-kit';

const ROWS = 3;
</script>

<template>
    <div class="cart-skeleton" aria-busy="true">
        <div class="cart-skeleton__list">
            <div v-for="row in ROWS" :key="row" class="cart-skeleton__row">
                <MvSkeleton width="20px" height="20px" radius="6px" />
                <MvSkeleton width="96px" height="96px" radius="18px" />
                <div class="cart-skeleton__info">
                    <MvSkeleton width="70%" height="18px" />
                    <MvSkeleton width="40%" height="12px" />
                    <MvSkeleton width="90px" height="22px" radius="999px" />
                </div>
                <MvSkeleton width="90px" height="22px" />
                <MvSkeleton width="132px" height="44px" radius="12px" />
            </div>
        </div>
        <div class="cart-skeleton__aside">
            <MvSkeleton height="52px" radius="16px" />
            <MvSkeleton width="60%" height="14px" />
            <MvSkeleton height="14px" />
            <MvSkeleton height="14px" />
            <MvSkeleton width="50%" height="28px" />
        </div>
    </div>
</template>

<style scoped>
.cart-skeleton {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 24px;
    align-items: start;
}

.cart-skeleton__list,
.cart-skeleton__aside {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
}

.cart-skeleton__list {
    padding: 8px 18px;
}

.cart-skeleton__row {
    display: grid;
    grid-template-columns: 28px 96px minmax(0, 1fr) 138px 160px;
    gap: 14px;
    align-items: center;
    padding: 18px 0;
    border-bottom: 1px solid #edf2ef;
}
.cart-skeleton__row:last-child {
    border-bottom: none;
}

.cart-skeleton__info {
    display: grid;
    gap: 10px;
}

.cart-skeleton__aside {
    display: grid;
    gap: 14px;
    padding: 24px;
}

@media (max-width: 1100px) {
    .cart-skeleton {
        grid-template-columns: 1fr;
    }
}
</style>
